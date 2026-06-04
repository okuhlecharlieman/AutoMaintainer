from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from models import PipelineRun, PipelineStatus, MemoryEntry
from services.orchestrator import orchestration_engine
from services.memory import memory_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class StartPipelineRequest(BaseModel):
    repo_url: str
    issue_url: str
    issue_number: int
    issue_title: str
    issue_body: str = ""


class ApproveRequest(BaseModel):
    reason: str = ""


class RejectRequest(BaseModel):
    reason: str = ""


class MemoryRequest(BaseModel):
    repo_url: str
    category: str
    content: str


class DemoPipelineRequest(BaseModel):
    repo_url: str = "https://github.com/example/demo-repo"
    issue_number: int = 42
    issue_title: str = "Login form crashes on empty password submission"
    issue_body: str = """## Bug Description
When a user submits the login form without entering a password, the application crashes with a 500 error instead of showing a validation message.

## Steps to Reproduce
1. Navigate to /login
2. Enter a valid email
3. Leave password field empty
4. Click "Sign In"

## Expected Behavior
Show "Password is required" validation message

## Actual Behavior
Application crashes with 500 Internal Server Error

## Environment
- Browser: Chrome 120
- OS: macOS 14.2"""


@router.post("/pipelines/start")
async def start_pipeline(request: StartPipelineRequest):
    pipeline = await orchestration_engine.start_pipeline(
        repo_url=request.repo_url,
        issue_url=request.issue_url,
        issue_number=request.issue_number,
        issue_title=request.issue_title,
        issue_body=request.issue_body,
    )
    return {"pipeline_id": pipeline.id, "status": pipeline.status.value}


@router.post("/pipelines/demo")
async def start_demo_pipeline(request: DemoPipelineRequest):
    pipeline = await orchestration_engine.start_pipeline(
        repo_url=request.repo_url,
        issue_url=f"{request.repo_url}/issues/{request.issue_number}",
        issue_number=request.issue_number,
        issue_title=request.issue_title,
        issue_body=request.issue_body,
    )
    return {"pipeline_id": pipeline.id, "status": pipeline.status.value}


@router.get("/pipelines")
async def list_pipelines():
    pipelines = orchestration_engine.list_pipelines()
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
    pipeline = orchestration_engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline.model_dump()


@router.post("/pipelines/{pipeline_id}/approve")
async def approve_pipeline(pipeline_id: str, request: ApproveRequest = None):
    try:
        pipeline = await orchestration_engine.approve_pipeline(pipeline_id)
        return {"status": pipeline.status.value, "pr_url": pipeline.pr_url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pipelines/{pipeline_id}/reject")
async def reject_pipeline(pipeline_id: str, request: RejectRequest = None):
    try:
        pipeline = await orchestration_engine.reject_pipeline(pipeline_id, request.reason if request else "")
        return {"status": pipeline.status.value}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/pipelines/{pipeline_id}/messages")
async def get_pipeline_messages(pipeline_id: str):
    pipeline = orchestration_engine.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {
        "messages": [m.model_dump() for m in pipeline.agent_messages]
    }


# Memory endpoints
@router.get("/memory/{repo_url:path}")
async def get_repo_memory(repo_url: str):
    repo_url = f"https://github.com/{repo_url}" if not repo_url.startswith("http") else repo_url
    memory = memory_service.get_repo_memory(repo_url)
    return {
        "repo_url": repo_url,
        "memory": {
            category: [e.model_dump() for e in entries]
            for category, entries in memory.items()
        },
    }


@router.post("/memory")
async def add_memory(request: MemoryRequest):
    entry = memory_service.add_manual(request.repo_url, request.category, request.content)
    return entry.model_dump()


# Health check
@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "automaintainer-backend"}
