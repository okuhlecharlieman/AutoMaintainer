from __future__ import annotations

import logging
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from core.auth import public_endpoint, require_api_key
from core.config import get_settings
from core.database import async_session
from integrations.github import github_client
from models import MemoryEntry, PipelineRun, PipelineStatus
from models.orm import UserORM
from services.llm import llm_registry
from services.memory import memory_service
from services.orchestrator import orchestration_engine

logger = logging.getLogger(__name__)

# Auth-protected router (all routes except those using public_endpoint)
router = APIRouter(dependencies=[Depends(require_api_key)])


async def _resolve_user_token(auth_info: dict) -> Optional[str]:
    """Look up the authenticated user's GitHub OAuth token from the database."""
    username = auth_info.get("user")
    if username in ("anonymous", "api_client", None):
        return None

    async with async_session() as session:
        result = await session.execute(
            select(UserORM.github_access_token).where(UserORM.github_username == username)
        )
        user_token = result.scalar_one_or_none()

    return user_token


# ── Request models ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., max_length=128)
    password: str = Field(..., max_length=128)


class StartPipelineRequest(BaseModel):
    repo_url: str = Field(..., max_length=2048)
    issue_url: str = Field(..., max_length=2048)
    issue_number: int = Field(..., ge=1)
    issue_title: str = Field(..., min_length=1, max_length=1024)
    issue_body: str = Field(default="", max_length=65536)

    @field_validator("repo_url", "issue_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in ("https", "http") or not parsed.hostname:
            raise ValueError("Must be a valid HTTP(S) URL")
        return parsed.geturl().rstrip("/")


class ApproveRequest(BaseModel):
    reason: str = Field(default="", max_length=4096)


class RejectRequest(BaseModel):
    reason: str = Field(default="", max_length=4096)


class MemoryRequest(BaseModel):
    repo_url: str = Field(..., max_length=2048)
    category: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=32768)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in ("https", "http") or not parsed.hostname:
            raise ValueError("repo_url must be a valid HTTP(S) URL")
        if parsed.hostname.lower() not in ("github.com", "www.github.com"):
            raise ValueError("repo_url must point to github.com")
        return parsed.geturl().rstrip("/")

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        allowed = {"pattern", "convention", "decision", "lesson"}
        if value.lower() not in allowed:
            raise ValueError(f"category must be one of: {', '.join(sorted(allowed))}")
        return value.lower()


class DemoPipelineRequest(BaseModel):
    repo_url: str = Field(default="https://github.com/example/demo-repo", max_length=2048)
    issue_number: int = Field(default=42, ge=1)
    issue_title: str = Field(default="Login form crashes on empty password submission", min_length=1, max_length=1024)
    issue_body: str = Field(
        default=(
            "## Bug Description\n"
            "When a user submits the login form without entering a password, "
            "the application crashes with a 500 error instead of showing a validation message.\n\n"
            "## Steps to Reproduce\n"
            "1. Navigate to /login\n2. Enter a valid email\n"
            "3. Leave password field empty\n4. Click 'Sign In'\n\n"
            "## Expected Behavior\nShow 'Password is required' validation message\n\n"
            "## Actual Behavior\nApplication crashes with 500 Internal Server Error\n\n"
            "## Environment\n- Browser: Chrome 120\n- OS: macOS 14.2"
        ),
        max_length=65536,
    )


# ── Pipeline endpoints ─────────────────────────────────────────────────────

@router.post("/pipelines/start", status_code=201)
async def start_pipeline(request: StartPipelineRequest, auth_info: dict = Depends(require_api_key)):
    """Start a new pipeline for an issue."""
    # Resolve per-user GitHub token
    github_token = await _resolve_user_token(auth_info)
    try:
        pipeline = await orchestration_engine.start_pipeline(
            repo_url=request.repo_url,
            issue_url=request.issue_url,
            issue_number=request.issue_number,
            issue_title=request.issue_title,
            issue_body=request.issue_body,
            github_token=github_token,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"pipeline_id": pipeline.id, "status": pipeline.status.value}


@router.post("/pipelines/demo", status_code=201)
async def start_demo_pipeline(request: DemoPipelineRequest, auth_info: dict = Depends(require_api_key)):
    """Start a demo pipeline (no GitHub token required)."""
    github_token = await _resolve_user_token(auth_info)
    try:
        pipeline = await orchestration_engine.start_pipeline(
            repo_url=request.repo_url,
            issue_url=f"{request.repo_url}/issues/{request.issue_number}",
            issue_number=request.issue_number,
            issue_title=request.issue_title,
            issue_body=request.issue_body,
            github_token=github_token,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"pipeline_id": pipeline.id, "status": pipeline.status.value}


@router.get("/pipelines")
async def list_pipelines(
    status: Optional[str] = Query(default=None, pattern="^(pending|analyzing|planning|developing|testing|security_scan|reviewing|documenting|awaiting_approval|approved|rejected|merged|failed)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List pipelines with optional status filter and pagination."""
    pipelines = orchestration_engine.list_pipelines(status=status, limit=limit, offset=offset)
    return {
        "pipelines": [
            {
                "id": p.id,
                "issue_title": p.issue_title,
                "issue_number": p.issue_number,
                "repo_url": p.repo_url,
                "status": p.status.value,
                "pr_url": p.pr_url,
                "review_score": p.review_score.overall if p.review_score else None,
                "files_changed": len(p.code_changes),
                "tests_passed": sum(1 for t in p.test_results if t.passed),
                "tests_total": len(p.test_results),
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
            }
            for p in pipelines
        ]
    }


@router.get("/pipelines/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    """Get a single pipeline by ID."""
    pipeline = orchestration_engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline.api_dump()


@router.post("/pipelines/{pipeline_id}/approve")
async def approve_pipeline(pipeline_id: str, request: ApproveRequest | None = None, auth_info: dict = Depends(require_api_key)):
    """Approve a pipeline awaiting human review."""
    github_token = await _resolve_user_token(auth_info)
    try:
        pipeline = await orchestration_engine.approve_pipeline(pipeline_id, github_token=github_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": pipeline.status.value, "pr_url": pipeline.pr_url}


@router.post("/pipelines/{pipeline_id}/reject")
async def reject_pipeline(pipeline_id: str, request: RejectRequest | None = None):
    """Reject a pipeline awaiting human review."""
    try:
        reason = request.reason if request else ""
        pipeline = await orchestration_engine.reject_pipeline(pipeline_id, reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": pipeline.status.value}


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    """Delete a completed pipeline."""
    try:
        await orchestration_engine.delete_pipeline(pipeline_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"deleted": True}


@router.post("/pipelines/{pipeline_id}/retry", status_code=201)
async def retry_pipeline(pipeline_id: str, auth_info: dict = Depends(require_api_key)):
    """Retry a failed pipeline by creating a new one with the same parameters."""
    pipeline = orchestration_engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if pipeline.status.value not in ("failed", "rejected"):
        raise HTTPException(status_code=400, detail="Only failed or rejected pipelines can be retried")
    github_token = await _resolve_user_token(auth_info)
    try:
        new_pipeline = await orchestration_engine.start_pipeline(
            repo_url=pipeline.repo_url,
            issue_url=pipeline.issue_url,
            issue_number=pipeline.issue_number,
            issue_title=pipeline.issue_title,
            github_token=github_token,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"pipeline_id": new_pipeline.id, "status": new_pipeline.status.value}


@router.get("/pipelines/{pipeline_id}/messages")
async def get_pipeline_messages(pipeline_id: str):
    """Get agent messages for a pipeline."""
    pipeline = orchestration_engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"messages": [m.model_dump() for m in pipeline.agent_messages]}


# ── Memory endpoints ────────────────────────────────────────────────────────

@router.get("/memory/{repo_url:path}")
async def get_repo_memory(repo_url: str):
    """Get learned memory for a repository."""
    resolved = f"https://github.com/{repo_url}" if not repo_url.startswith("http") else repo_url
    memory = memory_service.get_repo_memory(resolved)
    return {
        "repo_url": resolved,
        "memory": {
            category: [e.model_dump() for e in entries]
            for category, entries in memory.items()
        },
    }


@router.post("/memory", status_code=201)
async def add_memory(request: MemoryRequest):
    """Manually add a memory entry for a repository."""
    entry = await memory_service.add_manual(request.repo_url, request.category, request.content)
    return entry.model_dump()


# ── LLM Models ──────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models():
    """List configured LLM models."""
    return {"models": llm_registry.list_models()}


@router.get("/repos")
async def list_user_repos(auth_info: dict = Depends(require_api_key)):
    """List GitHub repos the authenticated user has access to."""
    user_token = await _resolve_user_token(auth_info)
    if not user_token:
        raise HTTPException(status_code=400, detail="No GitHub token available — sign in with GitHub first")
    try:
        repos = await github_client.list_user_repos(user_token)
        return {"repos": [{"name": r["name"], "full_name": r["full_name"], "url": r["html_url"], "description": r.get("description", ""), "private": r.get("private", False)} for r in repos]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch repos: {e}")


# ── System status ───────────────────────────────────────────────────────────

@router.get("/system/status")
async def system_status():
    """Get system status including backend config, LLM models, and pipeline stats."""
    from core.config import get_settings
    settings = get_settings()
    pipelines = orchestration_engine.list_pipelines(limit=1000)
    active = sum(1 for p in pipelines if p.status.value not in ("merged", "rejected", "failed"))

    return {
        "backend": {
            "status": "online",
            "auth_enabled": settings.auth_enabled,
            "max_concurrent_pipelines": settings.max_concurrent_pipelines,
            "pipeline_timeout_seconds": settings.pipeline_timeout_seconds,
        },
        "github": {
            "configured": bool(settings.github_token),
        },
        "llm": {
            "models": llm_registry.list_models(),
            "default_model": settings.default_model,
            "agent_models": {
                role: settings.get_agent_model(role)
                for role in ["developer", "reviewer", "architect", "issue_analyst", "qa_tester", "security", "documentation"]
            },
        },
        "pipelines": {
            "total": len(pipelines),
            "active": active,
            "running_tasks": len(orchestration_engine._running),
        },
    }


# ── Health check (public) ───────────────────────────────────────────────────

@router.get("/health", dependencies=[Depends(public_endpoint)])
async def health_check():
    """Service health check (no auth required)."""
    return {"status": "healthy", "service": "automaintainer-backend"}