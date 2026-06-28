from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from . import MemoryEntry, PipelineRun


class PipelineORM(Base):
    __tablename__ = "pipelines"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    repo_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    issue_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    issue_number: Mapped[int] = mapped_column(Integer, nullable=False)
    issue_title: Mapped[str] = mapped_column(String(1024), nullable=False)
    issue_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    agent_messages: Mapped[Optional[list]] = mapped_column(JSON, nullable=False, default=list)
    analysis: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    code_changes: Mapped[Optional[list]] = mapped_column(JSON, nullable=False, default=list)
    test_results: Mapped[Optional[list]] = mapped_column(JSON, nullable=False, default=list)
    security_findings: Mapped[Optional[list]] = mapped_column(JSON, nullable=False, default=list)
    review_score: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    pr_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    pr_title: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    pr_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    github_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    failed_at_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


def pipeline_to_orm(pipeline: PipelineRun) -> PipelineORM:
    data = pipeline.db_dump()
    return PipelineORM(**data)


def orm_to_pipeline(orm: PipelineORM) -> PipelineRun:
    data = {
        "id": orm.id,
        "repo_url": orm.repo_url,
        "issue_url": orm.issue_url,
        "issue_number": orm.issue_number,
        "issue_title": orm.issue_title,
        "issue_body": orm.issue_body or "",
        "custom_instructions": orm.custom_instructions or "",
        "status": orm.status,
        "agent_messages": orm.agent_messages or [],
        "analysis": orm.analysis,
        "code_changes": orm.code_changes or [],
        "test_results": orm.test_results or [],
        "security_findings": orm.security_findings or [],
        "review_score": orm.review_score,
        "pr_url": orm.pr_url,
        "pr_title": orm.pr_title,
        "pr_body": orm.pr_body,
        "github_token": orm.github_token,
        "created_at": orm.created_at,
        "updated_at": orm.updated_at,
        "error_message": orm.error_message,
        "failed_at_status": orm.failed_at_status,
    }
    return PipelineRun.model_validate(data)


# ── Memory persistence ──────────────────────────────────────────────────────

class MemoryORM(Base):
    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    repo_url: Mapped[str] = mapped_column(String(1024), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=False, default=dict)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def memory_to_orm(entry: MemoryEntry) -> MemoryORM:
    return MemoryORM(
        id=entry.id,
        repo_url=entry.repo_url,
        category=entry.category,
        content=entry.content,
        metadata_json=entry.metadata,
        relevance_score=entry.relevance_score,
        created_at=entry.created_at,
    )


def orm_to_memory(orm_row: MemoryORM) -> MemoryEntry:
    return MemoryEntry(
        id=orm_row.id,
        repo_url=orm_row.repo_url,
        category=orm_row.category,
        content=orm_row.content,
        metadata=orm_row.metadata_json or {},
        relevance_score=orm_row.relevance_score,
        created_at=orm_row.created_at,
    )


# ── User persistence ────────────────────────────────────────────────────────

class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    github_username: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    github_access_token: Mapped[str] = mapped_column(String(512), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Runtime settings persistence ────────────────────────────────────────────

class RuntimeSettingsORM(Base):
    __tablename__ = "runtime_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
