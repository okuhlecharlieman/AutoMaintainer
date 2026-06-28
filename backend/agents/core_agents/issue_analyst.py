from agents.base_agent import BaseAgent
from models import (
    AgentRole, PipelineRun, IssueAnalysis, IssueSeverity, IssueType, AgentMessage
)
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class IssueAnalystAgent(BaseAgent):
    role = AgentRole.ISSUE_ANALYST
    name = "Issue Analyst"
    system_prompt = """You are an expert Issue Analyst agent in a multi-agent software engineering team.

Your responsibilities:
1. Read and understand GitHub issues thoroughly
2. Classify the issue by severity and type
3. Extract clear requirements and acceptance criteria
4. Identify affected files and components
5. Suggest reproduction steps for bugs
6. Estimate complexity

You analyze issues with precision and provide structured, actionable analysis that other agents can use to plan and implement fixes.

Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        issue_content = context.get("issue_body", "")
        issue_title = pipeline.issue_title
        repo_info = context.get("repo_info", {})
        file_tree = context.get("file_tree", "")
        memory = context.get("memory", [])

        # Follow-up context from previous failed attempts
        prev_attempts = context.get("previous_attempts", [])
        followup_section = ""
        if prev_attempts:
            followup_parts = ["\n## Previous Attempts (this issue was tried before and failed)"]
            for i, attempt in enumerate(prev_attempts, 1):
                followup_parts.append(
                    f"- Attempt {i}: Failed at {attempt.get('failed_at', '?')} — {attempt.get('error', 'unknown')}"
                )
            followup_parts.append("Consider these failures in your analysis. The issue may need a simpler approach or different affected files.")
            followup_section = "\n".join(followup_parts)

        analysis_prompt = f"""Analyze this GitHub issue and provide a structured analysis.

## Issue Title
{issue_title}

## Issue Description
{issue_content}

## Repository Info
- URL: {pipeline.repo_url}
- Language: {repo_info.get('language', 'unknown')}

## File Tree (top-level)
{file_tree[:3000]}

## Relevant Memory
{chr(10).join([f'- {m.content}' for m in memory[:5]]) if memory else 'No prior memory for this repo.'}
{followup_section}

Provide your analysis as JSON with this structure:
{{
    "severity": "critical|high|medium|low",
    "issue_type": "bug|feature|documentation|refactor|security",
    "summary": "brief summary of the issue",
    "requirements": ["requirement 1", "requirement 2"],
    "affected_files": ["file1.py", "file2.py"],
    "reproduction_steps": ["step 1", "step 2"] or null,
    "estimated_complexity": "low|medium|high",
    "reasoning": "your reasoning for the classification"
}}"""

        result = await self.analyze(analysis_prompt)

        analysis = IssueAnalysis(
            issue_id=str(pipeline.issue_number),
            severity=IssueSeverity(result.get("severity", "medium")),
            issue_type=IssueType(result.get("issue_type", "bug")),
            summary=result.get("summary", "Analysis pending"),
            requirements=result.get("requirements", []),
            affected_files=result.get("affected_files", []),
            reproduction_steps=result.get("reproduction_steps"),
            estimated_complexity=result.get("estimated_complexity", "medium"),
        )

        message = self.create_message(
            content=f"**Issue Analysis Complete**\n\n"
                    f"**Severity:** {analysis.severity.value.upper()}\n"
                    f"**Type:** {analysis.issue_type.value}\n"
                    f"**Summary:** {analysis.summary}\n\n"
                    f"**Requirements:**\n" +
                    "\n".join([f"- {r}" for r in analysis.requirements]) +
                    f"\n\n**Affected Files:**\n" +
                    "\n".join([f"- `{f}`" for f in analysis.affected_files]),
            metadata={"analysis": analysis.model_dump()},
            thinking=result.get("reasoning", ""),
        )

        return {"analysis": analysis, "message": message}
