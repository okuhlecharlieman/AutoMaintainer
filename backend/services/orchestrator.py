import asyncio
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from models import (
    PipelineRun, PipelineStatus, PipelineEvent, AgentRole,
    CodeChange, TestResult, SecurityFinding, ReviewScore, AgentMessage,
)
from agents.core_agents.issue_analyst import IssueAnalystAgent
from agents.core_agents.developer import DeveloperAgent
from agents.core_agents.qa_tester import QATesterAgent
from agents.core_agents.reviewer import ReviewerAgent
from agents.stub_agents.architect import ArchitectAgent
from agents.stub_agents.security import SecurityAgent
from agents.stub_agents.documentation import DocumentationAgent
from services.memory import memory_service
from integrations.github import github_client
import logging

logger = logging.getLogger(__name__)


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

    def on_event(self, handler: Callable):
        self._event_handlers.append(handler)

    async def _emit_event(self, event: PipelineEvent):
        for handler in self._event_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"Event handler error: {e}")

    def get_pipeline(self, pipeline_id: str) -> Optional[PipelineRun]:
        return self._pipelines.get(pipeline_id)

    def list_pipelines(self) -> List[PipelineRun]:
        return list(self._pipelines.values())

    async def start_pipeline(
        self,
        repo_url: str,
        issue_url: str,
        issue_number: int,
        issue_title: str,
        issue_body: str = "",
    ) -> PipelineRun:
        pipeline = PipelineRun(
            repo_url=repo_url,
            issue_url=issue_url,
            issue_number=issue_number,
            issue_title=issue_title,
        )
        self._pipelines[pipeline.id] = pipeline

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

        try:
            # Phase 1: Gather context
            pipeline.status = PipelineStatus.ANALYZING
            await self._emit_event(PipelineEvent(
                pipeline_id=pipeline.id, event_type="phase_start",
                data={"phase": "context_gathering"},
            ))

            try:
                owner, repo = github_client.parse_repo_url(pipeline.repo_url)
                repo_info = await github_client.get_repo_info(owner, repo)
                context["repo_info"] = repo_info

                tree = await github_client.get_file_tree(owner, repo)
                file_tree = "\n".join([
                    f"{'📁 ' if t['type'] == 'tree' else '📄 '}{t['path']}"
                    for t in tree[:200]
                ])
                context["file_tree"] = file_tree

            except Exception as e:
                logger.warning(f"GitHub context fetch failed: {e}")
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
                    content = await github_client.get_file_content(owner, repo, file_path)
                    if content:
                        context["file_contents"][file_path] = content
            except Exception as e:
                logger.warning(f"Failed to fetch file contents: {e}")

            context["analysis"] = analysis

            # Phase 3: Architecture Planning
            pipeline.status = PipelineStatus.PLANNING
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

            # Phase 5: Testing
            pipeline.status = PipelineStatus.TESTING
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

        except Exception as e:
            logger.error(f"Pipeline {pipeline.id} failed: {e}", exc_info=True)
            pipeline.status = PipelineStatus.FAILED
            pipeline.error_message = str(e)
            await self._emit_event(PipelineEvent(
                pipeline_id=pipeline.id, event_type="pipeline_failed",
                data={"error": str(e)},
            ))

        finally:
            pipeline.updated_at = datetime.utcnow()
            if pipeline.id in self._running:
                del self._running[pipeline.id]

    async def approve_pipeline(self, pipeline_id: str) -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if pipeline.status != PipelineStatus.AWAITING_APPROVAL:
            raise ValueError(f"Pipeline is not awaiting approval (status: {pipeline.status})")

        pipeline.status = PipelineStatus.APPROVED

        # Try to create PR on GitHub
        try:
            owner, repo = github_client.parse_repo_url(pipeline.repo_url)
            branch_name = f"automaintainer/fix-{pipeline.issue_number}"

            await github_client.create_branch(owner, repo, branch_name)

            files = {c.file_path: c.new_content for c in pipeline.code_changes}
            commit_msg = f"fix: resolve #{pipeline.issue_number} - {pipeline.issue_title}"
            await github_client.commit_files(owner, repo, branch_name, commit_msg, files)

            pr = await github_client.create_pull_request(
                owner, repo,
                title=pipeline.pr_title or f"Fix #{pipeline.issue_number}: {pipeline.issue_title}",
                body=pipeline.pr_body or f"Automated fix for #{pipeline.issue_number}",
                head=branch_name,
            )
            pipeline.pr_url = pr.get("html_url", "")

            pipeline.status = PipelineStatus.MERGED

        except Exception as e:
            logger.error(f"Failed to create PR: {e}")
            pipeline.pr_url = f"PR creation failed: {e}"

        pipeline.updated_at = datetime.utcnow()

        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type="pipeline_approved",
            data={"pr_url": pipeline.pr_url},
        ))

        return pipeline

    async def reject_pipeline(self, pipeline_id: str, reason: str = "") -> PipelineRun:
        pipeline = self._pipelines.get(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        pipeline.status = PipelineStatus.REJECTED
        pipeline.updated_at = datetime.utcnow()

        await self._emit_event(PipelineEvent(
            pipeline_id=pipeline_id, event_type="pipeline_rejected",
            data={"reason": reason},
        ))

        return pipeline


orchestration_engine = OrchestrationEngine()
