from __future__ import annotations

import asyncio
import logging
import time
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
from services.llm import llm_registry
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
        self._event_subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._runtime_timeouts: Dict[str, int] = {}

    _STATUS_TO_ROLE = {
        "analyzing": "issue_analyst",
        "planning": "architect",
        "developing": "developer",
        "testing": "qa_tester",
        "security_scan": "security",
        "reviewing": "reviewer",
        "documenting": "documentation",
    }

    TIMEOUT_LIMITS = {"min": 30, "max": 900}

    def _agent_timeout(self, role: AgentRole) -> int:
        """Get the timeout in seconds for a given agent role."""
        runtime = self._runtime_timeouts.get(role.value)
        if runtime is not None:
            return runtime
        settings = get_settings()
        if role == AgentRole.DEVELOPER:
            return settings.agent_timeout_developer
        return settings.agent_timeout_default

    def get_timeouts(self) -> Dict[str, int]:
        """Get effective timeout for each agent role."""
        settings = get_settings()
        roles = ["issue_analyst", "architect", "developer", "qa_tester", "security", "reviewer", "documentation"]
        result = {}
        for role in roles:
            runtime = self._runtime_timeouts.get(role)
            if runtime is not None:
                result[role] = runtime
            elif role == "developer":
                result[role] = settings.agent_timeout_developer
            else:
                result[role] = settings.agent_timeout_default
        return result

    def set_timeouts(self, overrides: Dict[str, int]) -> Dict[str, int]:
        """Update runtime timeout overrides. Returns effective timeouts."""
        for role, seconds in overrides.items():
            if seconds < self.TIMEOUT_LIMITS["min"] or seconds > self.TIMEOUT_LIMITS["max"]:
                raise ValueError(
                    f"Timeout for '{role}' must be between "
                    f"{self.TIMEOUT_LIMITS['min']}s and {self.TIMEOUT_LIMITS['max']}s, got {seconds}s"
                )
            self._runtime_timeouts[role] = seconds
        return self.get_timeouts()

    def _model_label(self, status_value: str) -> str:
        """Get the model alias + slug for the agent running at a given pipeline status."""
        role = self._STATUS_TO_ROLE.get(status_value, "")
        if role:
            return llm_registry.resolve_model_for_role(role)
        return "unknown"

    async def _learn_from_failure(self, pipeline: PipelineRun, context: Dict[str, Any], error: str):
        """Learn from pipeline failures so future retries are smarter."""
        try:
            analysis = context.get("analysis")
            summary = analysis.summary if analysis else pipeline.issue_title
            await memory_service.learn(
                self._memory_key(pipeline),
                f"Issue: {pipeline.issue_title}. Analysis: {summary}",
                {
                    "status": "failed",
                    "error": error,
                    "failed_at": pipeline.failed_at_status or pipeline.status.value,
                    "code_changes": [c.model_dump() for c in pipeline.code_changes],
                    "review_score": {},
                },
            )
        except Exception as e:
            logger.warning("Failed to learn from pipeline failure: %s", e)

    def _get_previous_attempts(self, repo_url: str, issue_number: int, owner: Optional[str] = None) -> List[Dict[str, Any]]:
        """Find previous failed pipelines for the same issue to provide follow-up context."""
        attempts = []
        for p in self._pipelines.values():
            if (
                p.owner == owner
                and p.repo_url == repo_url
                and p.issue_number == issue_number
                and p.status == PipelineStatus.FAILED
            ):
                attempts.append({
                    "pipeline_id": p.id,
                    "error": p.error_message or "unknown",
                    "failed_at": p.failed_at_status or "unknown",
                    "agent_messages": [
                        {"role": m.agent_role.value, "summary": m.content[:200]}
                        for m in p.agent_messages[:4]
                    ],
                })
        return attempts[-3:]  # last 3 attempts

    @staticmethod
    def _memory_key(pipeline: PipelineRun) -> str:
        return f"{pipeline.repo_url.rstrip('/')}#owner={pipeline.owner}"

    def subscribe(self, pipeline_id: str) -> asyncio.Queue:
        """Subscribe to real-time events for a pipeline."""
        queue: asyncio.Queue = asyncio.Queue()
        self._event_subscribers.setdefault(pipeline_id, []).append(queue)
        return queue

    def unsubscribe(self, pipeline_id: str, queue: asyncio.Queue):
        """Unsubscribe from pipeline events."""
        subs = self._event_subscribers.get(pipeline_id, [])
        if queue in subs:
            subs.remove(queue)
        if not subs:
            self._event_subscribers.pop(pipeline_id, None)

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
                PipelineStatus.PR_CREATED,
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
        # Push to SSE subscribers
        for queue in self._event_subscribers.get(event.pipeline_id, []):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass
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

    async def cancel_pipeline(self, pipeline_id: str) -> PipelineRun:
        """Cancel a running pipeline."""
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")
        terminal = {PipelineStatus.MERGED, PipelineStatus.PR_CREATED, PipelineStatus.REJECTED, PipelineStatus.FAILED}
        if pipeline.status in terminal:
            raise ValueError(f"Pipeline already in terminal state '{pipeline.status.value}'")
        task = self._running.pop(pipeline_id, None)
        if task:
            task.cancel()
        pipeline.failed_at_status = pipeline.status.value
        pipeline.status = PipelineStatus.FAILED
        pipeline.error_message = "Pipeline stopped by user"
        pipeline.updated_at = _now()
        await self._persist_pipeline(pipeline)
        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline.id, event_type="pipeline_failed",
            data={"error": "cancelled_by_user", "failed_at": pipeline.failed_at_status},
        ))
        return pipeline

    async def delete_pipeline(self, pipeline_id: str) -> None:
        """Delete a pipeline (only terminal states: merged, rejected, failed)."""
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")
        terminal = {PipelineStatus.MERGED, PipelineStatus.PR_CREATED, PipelineStatus.REJECTED, PipelineStatus.FAILED}
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
        owner: Optional[str] = None,
    ) -> List[PipelineRun]:
        """List pipelines, optionally filtered by status, with pagination."""
        all_pipelines = sorted(
            self._pipelines.values(),
            key=lambda p: p.created_at,
            reverse=True,
        )
        if owner is not None:
            all_pipelines = [p for p in all_pipelines if p.owner == owner]
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
        custom_instructions: str = "",
        github_token: Optional[str] = None,
        owner: Optional[str] = None,
    ) -> PipelineRun:
        # Check concurrency limit
        if len(self._running) >= get_settings().max_concurrent_pipelines:
            raise ValueError(
                f"Already running {len(self._running)} pipelines (max: {get_settings().max_concurrent_pipelines}). "
                "Wait for a running pipeline to complete before starting a new one."
            )

        pipeline = PipelineRun(
            owner=owner,
            repo_url=repo_url,
            issue_url=issue_url,
            issue_number=issue_number,
            issue_title=issue_title,
            issue_body=issue_body,
            custom_instructions=custom_instructions,
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
        if pipeline.custom_instructions:
            context["custom_instructions"] = pipeline.custom_instructions
        settings = get_settings()
        token = pipeline.github_token

        # Inject follow-up context from previous failed attempts on the same issue
        prev_attempts = self._get_previous_attempts(pipeline.repo_url, pipeline.issue_number, pipeline.owner)
        if prev_attempts:
            context["previous_attempts"] = prev_attempts
            logger.info(
                "Pipeline %s: found %d previous attempt(s) for issue #%d — injecting follow-up context",
                pipeline.id, len(prev_attempts), pipeline.issue_number,
            )

        async with self._semaphore:
            try:
                # Phase 1: Gather context
                pipeline.status = PipelineStatus.ANALYZING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="phase_start",
                    data={"phase": "context_gathering"},
                ))

                owner, repo = github_client.parse_repo_url(pipeline.repo_url)
                repo_info = await github_client.get_repo_info(owner, repo, token=token)
                context["repo_info"] = repo_info
                pipeline.base_branch = repo_info["default_branch"]
                pipeline.base_sha = await github_client.get_branch_sha(owner, repo, pipeline.base_branch, token=token)
                tree = await github_client.get_file_tree(owner, repo, token=token, ref=pipeline.base_sha)
                context["file_paths"] = {t["path"] for t in tree if t["type"] == "blob"}
                file_tree = "\n".join(t["path"] for t in tree)
                if len(file_tree) > 120_000:
                    raise ValueError("Repository tree exceeds context budget; narrow repository scope")
                context["file_tree"] = file_tree

                context["memory"] = memory_service.recall(self._memory_key(pipeline))

                # Phase 2: Issue Analysis
                stage_start = time.perf_counter()
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.ISSUE_ANALYST,
                    data={"phase": "issue_analysis"},
                ))

                analyst = self.agents[AgentRole.ISSUE_ANALYST]
                analysis_result = await asyncio.wait_for(analyst.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.ISSUE_ANALYST))
                analysis = analysis_result["analysis"]
                pipeline.analysis = analysis
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                analysis_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(analysis_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.ISSUE_ANALYST,
                    data={"summary": analysis.summary, "duration_ms": duration_ms},
                ))

                # Fetch affected file contents
                context["file_contents"] = {}
                for file_path in analysis.affected_files:
                    if file_path in context["file_paths"]:
                        context["file_contents"][file_path] = await github_client.get_file_content(
                            owner, repo, file_path, ref=pipeline.base_sha, token=token)

                context["analysis"] = analysis

                # Phase 3: Architecture Planning
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.PLANNING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.ARCHITECT,
                    data={"phase": "architecture"},
                ))

                architect = self.agents[AgentRole.ARCHITECT]
                arch_result = await asyncio.wait_for(architect.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.ARCHITECT))
                context["architecture_plan"] = arch_result["architecture_plan"]
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                arch_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(arch_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.ARCHITECT,
                    data={"duration_ms": duration_ms},
                ))

                # Phase 4: Development
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.DEVELOPING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.DEVELOPER,
                    data={"phase": "development"},
                ))

                developer = self.agents[AgentRole.DEVELOPER]
                dev_result = await asyncio.wait_for(developer.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.DEVELOPER))
                code_changes = dev_result["code_changes"]
                context["code_changes"] = code_changes
                pipeline.code_changes = code_changes
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                dev_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(dev_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.DEVELOPER,
                    data={"files_changed": len(code_changes), "duration_ms": duration_ms},
                ))

                if not code_changes:
                    dev_model = self._model_label("developing")
                    logger.error("Pipeline %s: Developer produced no code changes after retries (model: %s)", pipeline.id, dev_model)
                    pipeline.status = PipelineStatus.FAILED
                    pipeline.error_message = (
                        f"Developer agent failed to generate code changes. "
                        f"Model used: {dev_model}. "
                        f"The LLM may not have returned valid file modifications. "
                        f"Try retrying the pipeline or providing more specific issue details."
                    )
                    await self._persist_pipeline(pipeline)
                    await self._emit_event(PipelineEvent(
                        pipeline_id=pipeline.id, event_type="pipeline_failed",
                        data={"error": "no_code_changes", "phase": "development"},
                    ))
                    return

                # Phase 5: Testing
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.TESTING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.QA_TESTER,
                    data={"phase": "testing"},
                ))

                qa = self.agents[AgentRole.QA_TESTER]
                qa_result = await asyncio.wait_for(qa.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.QA_TESTER))
                context["test_results"] = qa_result["test_results"]
                pipeline.test_results = qa_result["test_results"]
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                qa_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(qa_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.QA_TESTER,
                    data={"tests_passed": sum(1 for t in qa_result["test_results"] if t.passed), "duration_ms": duration_ms},
                ))

                if not pipeline.test_results or any(not t.executed or not t.passed for t in pipeline.test_results):
                    raise ValueError("Repository checks failed or were not executed; configure the worker or fix the reported failures")

                # Phase 6: Security Scan
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.SECURITY_SCAN
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.SECURITY,
                    data={"phase": "security_scan"},
                ))

                security = self.agents[AgentRole.SECURITY]
                sec_result = await asyncio.wait_for(security.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.SECURITY))
                context["security_findings"] = sec_result["security_findings"]
                pipeline.security_findings = sec_result["security_findings"]
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                sec_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(sec_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.SECURITY,
                    data={"findings": len(sec_result["security_findings"]), "duration_ms": duration_ms},
                ))

                if (sec_result.get("security_safe") is not True
                        or any(f.severity.lower() in {"critical", "high"} for f in pipeline.security_findings)):
                    raise ValueError("Security review blocked this change")

                # Phase 7: Code Review
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.REVIEWING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.REVIEWER,
                    data={"phase": "review"},
                ))

                reviewer = self.agents[AgentRole.REVIEWER]
                review_result = await asyncio.wait_for(reviewer.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.REVIEWER))
                context["review_score"] = review_result["review_score"]
                pipeline.review_score = review_result["review_score"]
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                review_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(review_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.REVIEWER,
                    data={"approved": review_result["approved"], "score": review_result["review_score"].overall, "duration_ms": duration_ms},
                ))

                self._validate_quality(pipeline)

                # Phase 8: Documentation
                stage_start = time.perf_counter()
                pipeline.status = PipelineStatus.DOCUMENTING
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_start",
                    agent_role=AgentRole.DOCUMENTATION,
                    data={"phase": "documentation"},
                ))

                docs = self.agents[AgentRole.DOCUMENTATION]
                docs_result = await asyncio.wait_for(docs.execute(pipeline, context), timeout=self._agent_timeout(AgentRole.DOCUMENTATION))
                pipeline.pr_title = docs_result.get("pr_title", f"Fix: {pipeline.issue_title}")
                pipeline.pr_body = docs_result.get("pr_body", "")
                duration_ms = int((time.perf_counter() - stage_start) * 1000)
                docs_result["message"].metadata["duration_ms"] = duration_ms
                pipeline.agent_messages.append(docs_result["message"])

                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="agent_complete",
                    agent_role=AgentRole.DOCUMENTATION,
                    data={"duration_ms": duration_ms},
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
                    self._memory_key(pipeline),
                    f"Issue: {pipeline.issue_title}. Analysis: {analysis.summary}",
                    {
                        "status": pipeline.status.value,
                        "code_changes": [c.model_dump() for c in pipeline.code_changes],
                        "review_score": pipeline.review_score.model_dump() if pipeline.review_score else {},
                    },
                )

            except asyncio.CancelledError:
                logger.warning("Pipeline %s cancelled (shutdown or timeout)", pipeline.id)
                pipeline.failed_at_status = pipeline.status.value
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = "Pipeline cancelled"
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="pipeline_failed",
                    data={"error": "cancelled", "failed_at": pipeline.failed_at_status},
                ))

            except (asyncio.TimeoutError, TimeoutError) as e:
                agent_name = pipeline.status.value
                model_used = self._model_label(agent_name)
                timeout_used = self._agent_timeout(AgentRole.DEVELOPER) if "develop" in agent_name.lower() else get_settings().agent_timeout_default
                logger.error("Pipeline %s: agent timed out at %s after %ds (model: %s)", pipeline.id, agent_name, timeout_used, model_used)
                pipeline.failed_at_status = pipeline.status.value
                pipeline.status = PipelineStatus.FAILED
                pipeline.error_message = f"Agent timed out at {agent_name} stage (>{timeout_used}s). Model used: {model_used}. The LLM may be overloaded — try again later or use a different model."
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="pipeline_failed",
                    data={"error": "agent_timeout", "failed_at": pipeline.failed_at_status, "timeout_seconds": timeout_used},
                ))
                # Learn from the timeout failure
                await self._learn_from_failure(pipeline, context, f"timeout at {agent_name}")

            except Exception as e:
                agent_name = pipeline.status.value
                model_used = self._model_label(agent_name)
                logger.error("Pipeline %s failed: %s (model: %s)", pipeline.id, e, model_used, exc_info=True)
                pipeline.failed_at_status = pipeline.status.value
                pipeline.status = PipelineStatus.FAILED
                error_str = str(e)
                pipeline.error_message = f"{error_str} [Model: {model_used}]"
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                await self._emit_event(PipelineEvent(
                    pipeline_id=pipeline.id, event_type="pipeline_failed",
                    data={"error": str(e), "failed_at": pipeline.failed_at_status},
                ))
                # Learn from the error
                await self._learn_from_failure(pipeline, context, str(e))

            finally:
                pipeline.updated_at = _now()
                await self._persist_pipeline(pipeline)
                if pipeline.id in self._running:
                    del self._running[pipeline.id]

    @staticmethod
    def _validate_quality(pipeline: PipelineRun):
        if not pipeline.test_results or any(not t.executed or not t.passed for t in pipeline.test_results):
            raise ValueError("Approval blocked: repository checks failed or were not executed")
        security = next((m for m in reversed(pipeline.agent_messages) if m.agent_role == AgentRole.SECURITY), None)
        if (not security or security.metadata.get("safe") is not True
                or any(f.severity.lower() in {"critical", "high"} for f in pipeline.security_findings)):
            raise ValueError("Approval blocked: security review is missing or unsafe")
        review = next((m for m in reversed(pipeline.agent_messages) if m.agent_role == AgentRole.REVIEWER), None)
        if (not review or review.metadata.get("approved") is not True
                or review.metadata.get("verdict") != "approved"
                or review.metadata.get("critical_issues")):
            raise ValueError("Approval blocked: reviewer requested changes or did not approve")

    async def approve_pipeline(self, pipeline_id: str, github_token: Optional[str] = None) -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if pipeline.status != PipelineStatus.AWAITING_APPROVAL:
            raise ValueError(f"Pipeline is not awaiting approval (status: {pipeline.status.value})")

        # Validate that there are code changes to push
        if not pipeline.code_changes:
            raise ValueError("Pipeline has no code changes to push — the developer agent likely failed to generate changes")

        self._validate_quality(pipeline)
        if not pipeline.base_sha or not pipeline.base_branch:
            raise ValueError("Source commit is missing; rerun this legacy pipeline")

        pipeline.status = PipelineStatus.APPROVED
        await self._persist_pipeline(pipeline)

        # Try to create PR on GitHub
        token = github_token or pipeline.github_token
        try:
            owner, repo = github_client.parse_repo_url(pipeline.repo_url)
            # Use unique branch name with pipeline ID suffix to avoid conflicts
            short_id = pipeline.id[:8]
            branch_name = f"automaintainer/fix-{pipeline.issue_number}-{short_id}"

            head = await github_client.get_branch_sha(owner, repo, pipeline.base_branch, token=token)
            if head != pipeline.base_sha:
                raise ValueError("Base branch changed since verification; rerun before opening a PR")
            await github_client.create_branch(owner, repo, branch_name, token=token,
                                              from_ref=pipeline.base_branch, sha=pipeline.base_sha)

            files = {c.file_path: None if c.change_type == "delete" else c.new_content for c in pipeline.code_changes}
            commit_msg = f"fix: resolve #{pipeline.issue_number} - {pipeline.issue_title}"
            await github_client.commit_files(owner, repo, branch_name, commit_msg, files, token=token)

            pr = await github_client.create_pull_request(
                owner, repo,
                title=pipeline.pr_title or f"Fix #{pipeline.issue_number}: {pipeline.issue_title}",
                body=pipeline.pr_body or f"Automated fix for #{pipeline.issue_number}",
                head=branch_name,
                base=pipeline.base_branch,
                token=token,
            )
            pipeline.pr_url = pr.get("html_url", "")
            pipeline.status = PipelineStatus.PR_CREATED

        except Exception as e:
            logger.error("Failed to create PR for pipeline %s: %s", pipeline_id, e, exc_info=True)
            error_detail = str(e)
            # Extract HTTP status details from httpx errors
            if hasattr(e, 'response') and e.response is not None:
                try:
                    body = e.response.json()
                    error_detail = body.get("message", error_detail)
                    # Check for "already exists" type errors
                    errors = body.get("errors", [])
                    if errors:
                        error_detail += " — " + "; ".join(
                            err.get("message", "") for err in errors if isinstance(err, dict)
                        )
                except Exception:
                    pass
            pipeline.status = PipelineStatus.FAILED
            pipeline.error_message = f"PR creation failed: {error_detail}"
            pipeline.pr_url = ""

        pipeline.updated_at = _now()
        await self._persist_pipeline(pipeline)

        event_type = "pipeline_approved" if pipeline.status == PipelineStatus.PR_CREATED else "pipeline_failed"
        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type=event_type,
            data={"pr_url": pipeline.pr_url, "status": pipeline.status.value},
        ))

        return pipeline

    async def reject_pipeline(self, pipeline_id: str, reason: str = "") -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if pipeline.status != PipelineStatus.AWAITING_APPROVAL:
            raise ValueError("Only a pipeline awaiting approval can be rejected")
        pipeline.status = PipelineStatus.REJECTED
        pipeline.updated_at = _now()
        await self._persist_pipeline(pipeline)

        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type="pipeline_rejected",
            data={"reason": reason},
        ))

        return pipeline


orchestration_engine = OrchestrationEngine()
