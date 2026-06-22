from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.core_agents.developer import DeveloperAgent
from agents.core_agents.issue_analyst import IssueAnalystAgent
from agents.core_agents.qa_tester import QATesterAgent
from agents.core_agents.reviewer import ReviewerAgent
from agents.stub_agents.architect import ArchitectAgent
from agents.stub_agents.documentation import DocumentationAgent
from agents.stub_agents.security import SecurityAgent
from core.config import get_settings
from core.database import async_session
from integrations.github import github_client
from models import (
    AgentMessage,
    AgentRole,
    CodeChange,
    PipelineEvent,
    PipelineRun,
    PipelineStatus,
    ReviewScore,
    SecurityFinding,
    TestResult,
)
from models.orm import PipelineORM, orm_to_pipeline, pipeline_to_orm
from services.memory import memory_service

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class OrchestrationEngine:
    def __init__(self):
        self.agents = {
            AgentRole.ISSUE_ANALYST: IssueAnalystAgent(),
            AgentRole.ARCHITECT: ArchitectAgent(),
            AgentRole.DEVELOPER: DeveloperAgent(),
            AgentRole.QA_TESTER: QATesterAgent(),
            AgentRole.SECURITY: SecurityAgent(),
            AgentRole.DOCUMENTATION: DocumentationAgent(),
            AgentRole.REVIEWER: ReviewerAgent(),
        }
        self._pipelines: Dict[str, PipelineRun] = {}
        self._event_handlers: List[Callable] = []
        self._running: Dict[str, asyncio.Task] = {}
        self._concurrency_semaphore: Optional[asyncio.Semaphore] = None

    @property
    def _semaphore(self) -> asyncio.Semaphore:
        if self._concurrency_semaphore is None:
            settings = get_settings()
            self._concurrency_semaphore = asyncio.Semaphore(settings.max_concurrent_pipelines)
        return self._concurrency_semaphore

    def on_event(self, handler: Callable):
        self._event_handlers.append(handler)

    async def initialize(self, db: AsyncSession):
        result = await db.execute(select(PipelineORM))
        rows = result.scalars().all()
        self._pipelines = {row.id: orm_to_pipeline(row) for row in rows}
        self._running = {}
        logger.info("Loaded %d persisted pipelines", len(self._pipelines))

        # Fail any pipelines that were left in a running state during previous shutdown
        for pipeline in self._pipelines.values():
            if pipeline.status in {
                PipelineStatus.PENDING,
                PipelineStatus.ANALYZING,
                PipelineStatus.PLANNING,
                PipelineStatus.DEVELOPING,
                PipelineStatus.TESTING,
                PipelineStatus.SECURITY_SCAN,
                PipelineStatus.REVIEWING,
                PipelineStatus.DOCUMENTING,
            }:
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = "Server restarted while pipeline was running"
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                logger.warning(
                    "Pipeline %s was in %s state at shutdown — marked FAILED",
                    pipeline.id,
                    pipeline.status.value,
                )

    async def shutdown(self):
        """Cancel all running pipeline tasks gracefully."""
        for pipeline_id, task in list(self._running.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            pipeline = self._pipelines.get(pipeline_id)
            if pipeline and pipeline.status not in {
                PipelineStatus.MERGED,
                PipelineStatus.REJECTED,
                PipelineStatus.FAILED,
            }:
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = "Server shutting down"
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
        self._running.clear()

    async def _persist_pipeline(self, pipeline: PipelineRun):
        async with async_session() as session:
            existing = await session.get(PipelineORM, pipeline.id)
            data = pipeline.db_dump()
            if existing:
                for key, value in data.items():
                    if key in {"created_at", "updated_at"}:
                        continue
                    setattr(existing, key, value)
                existing.updated_at = pipeline.updated_at
                await session.commit()
            else:
                session.add(pipeline_to_orm(pipeline))
                await session.commit()

    async def _emit_event(self, event: PipelineEvent):
        for handler in self._event_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error("Event handler error: %s", e)

    def get_pipeline(self, pipeline_id: str) -> Optional[PipelineRun]:
        return self._pipelines.get(pipeline_id)

    async def delete_pipeline(self, pipeline_id: str) -> None:
        """Delete a pipeline (only terminal states: merged, rejected, failed)."""
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")
        terminal = {PipelineStatus.MERGED, PipelineStatus.REJECTED, PipelineStatus.FAILED}
        if pipeline.status not in terminal:
            raise ValueError(f"Cannot delete pipeline in '{pipeline.status.value}' state. Only completed pipelines can be deleted.")
        # Cancel task if somehow still tracked
        task = self._running.pop(pipeline_id, None)
        if task:
            task.cancel()
        del self._pipelines[pipeline_id]
        async with async_session() as session:
            existing = await session.get(PipelineORM, pipeline_id)
            if existing:
                await session.delete(existing)
                await session.commit()

    def list_pipelines(
        self,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[PipelineRun]:
        """List pipelines, optionally filtered by status, with pagination."""
        all_pipelines = sorted(
            self._pipelines.values(),
            key=lambda p: p.created_at,
            reverse=True,
        )
        if status:
            all_pipelines = [p for p in all_pipelines if p.status.value == status]
        return all_pipelines[offset : offset + limit]

    async def start_pipeline(
        self,
        repo_url: str,
        issue_url: str,
        issue_number: int,
        issue_title: str,
        issue_body: str = "",
        github_token: Optional[str] = None,
    ) -> PipelineRun:
        # Check concurrency limit
        if len(self._running) >= get_settings().max_concurrent_pipelines:
            raise ValueError(
                f"Already running {len(self._running)} pipelines (max: {get_settings().max_concurrent_pipelines}). "
                "Wait for a running pipeline to complete before starting a new one."
            )

        pipeline = PipelineRun(
            repo_url=repo_url,
            issue_url=issue_url,
            issue_number=issue_number,
            issue_title=issue_title,
            github_token=github_token,
        )
        self._pipelines[pipeline.id] = pipeline
        await self._persist_pipeline(pipeline)

        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline.id,
            event_type="pipeline_started",
            data={"issue_title": issue_title, "issue_number": issue_number},
        ))

        task = asyncio.create_task(self._run_pipeline(pipeline, issue_body))
        self._running[pipeline.id] = task

        return pipeline

    async def _run_pipeline(self, pipeline: PipelineRun, issue_body: str):
        context: Dict[str, Any] = {"issue_body": issue_body}
        settings = get_settings()
        token = pipeline.github_token

        async with self._semaphore:
            try:
                # Phase 1: Gather context
                pipeline.status = PipelineStatus.ANALYZING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="phase_start",
                    data={"phase": "context_gathering"},
                ))

                try:
                    owner, repo = github_client.parse_repo_url(pipeline.repo_url)
                    repo_info = await github_client.get_repo_info(owner, repo, token=token)
                    context["repo_info"] = repo_info

                    tree = await github_client.get_file_tree(owner, repo, token=token)
                    file_tree = "\n".join([
                        f"{'📁 ' if t['type'] == 'tree' else '📄 '}{t['path']}"
                        for t in tree[:200]
                    ])
                    context["file_tree"] = file_tree

                except Exception as e:
                    logger.warning("GitHub context fetch failed: %s", e)
                    context["repo_info"] = {}
                    context["file_tree"] = "Unable to fetch file tree"

                context["memory"] = memory_service.recall(pipeline.repo_url)

                # Phase 2: Issue Analysis
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.ISSUE_ANALYST,
                    data={"phase": "issue_analysis"},
                ))

                analyst = self.agents[AgentRole.ISSUE_ANALYST]
                analysis_result = await analyst.execute(pipeline, context)
                analysis = analysis_result["analysis"]
                pipeline.analysis = analysis
                pipeline.agent_messages.append(analysis_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.ISSUE_ANALYST,
                    data={"summary": analysis.summary},
                ))

                # Fetch affected file contents
                context["file_contents"] = {}
                try:
                    owner, repo = github_client.parse_repo_url(pipeline.repo_url)
                    for file_path in analysis.affected_files[:10]:
                        content = await github_client.get_file_content(owner, repo, file_path, token=token)
                        if content:
                            context["file_contents"][file_path] = content
                except Exception as e:
                    logger.warning("Failed to fetch file contents: %s", e)

                context["analysis"] = analysis

                # Phase 3: Architecture Planning
                pipeline.status = PipelineStatus.PLANNING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.ARCHITECT,
                    data={"phase": "architecture"},
                ))

                architect = self.agents[AgentRole.ARCHITECT]
                arch_result = await architect.execute(pipeline, context)
                context["architecture_plan"] = arch_result["architecture_plan"]
                pipeline.agent_messages.append(arch_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.ARCHITECT,
                ))

                # Phase 4: Development
                pipeline.status = PipelineStatus.DEVELOPING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.DEVELOPER,
                    data={"phase": "development"},
                ))

                developer = self.agents[AgentRole.DEVELOPER]
                dev_result = await developer.execute(pipeline, context)
                code_changes = dev_result["code_changes"]
                context["code_changes"] = code_changes
                pipeline.code_changes = code_changes
                pipeline.agent_messages.append(dev_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.DEVELOPER,
                    data={"files_changed": len(code_changes)},
                ))

                if not code_changes:
                    logger.error("Pipeline %s: Developer produced no code changes after retries", pipeline.id)
                    pipeline.status = PipelineStatus.FAILED
                    pipeline.error_message = (
                        "Developer agent failed to generate code changes. "
                        "The LLM may not have returned valid file modifications. "
                        "Try retrying the pipeline or providing more specific issue details."
                    )
                    await self._persist_pipeline(pipeline)
                    await self._emit_event(PipelineEvent(
                        pipeline_id=pipeline.id, event_type="pipeline_failed",
                        data={"error": "no_code_changes", "phase": "development"},
                    ))
                    return

                # Phase 5: Testing
                pipeline.status = PipelineStatus.TESTING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.QA_TESTER,
                    data={"phase": "testing"},
                ))

                qa = self.agents[AgentRole.QA_TESTER]
                qa_result = await qa.execute(pipeline, context)
                context["test_results"] = qa_result["test_results"]
                pipeline.test_results = qa_result["test_results"]
                pipeline.agent_messages.append(qa_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.QA_TESTER,
                    data={"tests_passed": sum(1 for t in qa_result["test_results"] if t.passed)},
                ))

                # Phase 6: Security Scan
                pipeline.status = PipelineStatus.SECURITY_SCAN
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.SECURITY,
                    data={"phase": "security_scan"},
                ))

                security = self.agents[AgentRole.SECURITY]
                sec_result = await security.execute(pipeline, context)
                context["security_findings"] = sec_result["security_findings"]
                pipeline.security_findings = sec_result["security_findings"]
                pipeline.agent_messages.append(sec_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.SECURITY,
                    data={"findings": len(sec_result["security_findings"])},
                ))

                # Phase 7: Code Review
                pipeline.status = PipelineStatus.REVIEWING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.REVIEWER,
                    data={"phase": "review"},
                ))

                reviewer = self.agents[AgentRole.REVIEWER]
                review_result = await reviewer.execute(pipeline, context)
                context["review_score"] = review_result["review_score"]
                pipeline.review_score = review_result["review_score"]
                pipeline.agent_messages.append(review_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.REVIEWER,
                    data={"approved": review_result["approved"], "score": review_result["review_score"].overall},
                ))

                # Phase 8: Documentation
                pipeline.status = PipelineStatus.DOCUMENTING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.DOCUMENTATION,
                    data={"phase": "documentation"},
                ))

                docs = self.agents[AgentRole.DOCUMENTATION]
                docs_result = await docs.execute(pipeline, context)
                pipeline.pr_title = docs_result.get("pr_title", f"Fix: {pipeline.issue_title}")
                pipeline.pr_body = docs_result.get("pr_body", "")
                pipeline.agent_messages.append(docs_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.DOCUMENTATION,
                ))

                # Phase 9: Awaiting Human Approval
                pipeline.status = PipelineStatus.AWAITING_APPROVAL
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="awaiting_approval",
                    data={
                        "pr_title": pipeline.pr_title,
                        "review_score": pipeline.review_score.overall if pipeline.review_score else 0,
                        "files_changed": len(pipeline.code_changes),
                    },
                ))

                # Learn from this pipeline
                await memory_service.learn(
                    pipeline.repo_url,
                    f"Issue: {pipeline.issue_title}. Analysis: {analysis.summary}",
                    {
                        "status": pipeline.status.value,
                        "code_changes": [c.model_dump() for c in pipeline.code_changes],
                        "review_score": pipeline.review_score.model_dump() if pipeline.review_score else {},
                    },
                )

            except asyncio.CancelledError:
                logger.warning("Pipeline %s cancelled (shutdown or timeout)", pipeline.id)
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = "Pipeline cancelled"
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="pipeline_failed",
                    data={"error": "cancelled"},
                ))

            except Exception as e:
                logger.error("Pipeline %s failed: %s", pipeline.id, e, exc_info=True)
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = str(e)
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="pipeline_failed",
                    data={"error": str(e)},
                ))

            finally:
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                if pipeline.id in self._running:
                    del self._running[pipeline.id]

    async def approve_pipeline(self, pipeline_id: str, github_token: Optional[str] = None) -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if pipeline.status != PipelineStatus.AWAITING_APPROVAL:
            raise ValueError(f"Pipeline is not awaiting approval (status: {pipeline.status.value})")

        # Validate that there are code changes to push
        if not pipeline.code_changes:
            raise ValueError("Pipeline has no code changes to push — the developer agent likely failed to generate changes")

        pipeline.status = PipelineStatus.APPROVED
        await self._persist_pipeline(pipeline)

        # Try to create PR on GitHub
        token = github_token or pipeline.github_token
        try:
            owner, repo = github_client.parse_repo_url(pipeline.repo_url)
            branch_name = f"automaintainer/fix-{pipeline.issue_number}"

            await github_client.create_branch(owner, repo, branch_name, token=token)

            files = {c.file_path: c.new_content for c in pipeline.code_changes}
            commit_msg = f"fix: resolve #{pipeline.issue_number} - {pipeline.issue_title}"
            await github_client.commit_files(owner, repo, branch_name, commit_msg, files, token=token)

            pr = await github_client.create_pull_request(
                owner, repo,
                title=pipeline.pr_title or f"Fix #{pipeline.issue_number}: {pipeline.issue_title}",
                body=pipeline.pr_body or f"Automated fix for #{pipeline.issue_number}",
                head=branch_name,
                token=token,
            )
            pipeline.pr_url = pr.get("html_url", "")
            pipeline.status = PipelineStatus.MERGED

        except Exception as e:
            logger.error("Failed to create PR for pipeline %s: %s", pipeline_id, e, exc_info=True)
            error_detail = str(e)
            # Extract HTTP status details from httpx errors
            if hasattr(e, 'response') and e.response is not None:
                try:
                    body = e.response.json()
                    error_detail = body.get("message", error_detail)
                except Exception:
                    pass
            pipeline.status = PipelineStatus.FAILED
            pipeline.error_message = f"PR creation failed: {error_detail}"
            pipeline.pr_url = ""

        pipeline.updated_at = _now()
        await self._persist_pipeline(pipeline)

        event_type = "pipeline_approved" if pipeline.status == PipelineStatus.MERGED else "pipeline_failed"
        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type=event_type,
            data={"pr_url": pipeline.pr_url, "status": pipeline.status.value},
        ))

        return pipeline

    async def reject_pipeline(self, pipeline_id: str, reason: str = "") -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        pipeline.status = PipelineStatus.REJECTED
        pipeline.updated_at = _now()
        await self._persist_pipeline(pipeline)

        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type="pipeline_rejected",
            data={"reason": reason},
        ))

        return pipeline


orchestration_engine = OrchestrationEngine()
