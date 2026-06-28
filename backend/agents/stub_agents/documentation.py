from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, AgentMessage
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class DocumentationAgent(BaseAgent):
    role = AgentRole.DOCUMENTATION
    name = "Documentation Writer"
    system_prompt = """You are a Documentation agent. You generate clear changelogs, PR descriptions,
and update documentation when code changes require it.
Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        code_changes = context.get("code_changes", [])
        analysis = context.get("analysis")
        review_score = context.get("review_score")

        changes_desc = "\n".join([
            f"- {c.change_type}: `{c.file_path}`" for c in code_changes
        ])

        doc_prompt = f"""Generate documentation for these changes.

## Issue
{pipeline.issue_title}
{analysis.summary if analysis else ''}

## Changes Made
{changes_desc}

## Review Score
{review_score.overall if review_score else 'N/A'}/10

Respond with JSON:
{{
    "pr_title": "fix: concise PR title",
    "pr_body": "detailed PR description with context, changes, and testing notes",
    "changelog_entry": "- concise changelog line",
    "docs_needed": true/false,
    "docs_updates": ["description of any doc updates needed"],
    "commit_message": "fix: conventional commit message"
}}"""

        doc_prompt = self._inject_custom_instructions(doc_prompt, context)
        result = await self.analyze(doc_prompt)

        message = self.create_message(
            content=f"**Documentation Generated**\n\n"
                    f"**PR Title:** {result.get('pr_title', 'N/A')}\n\n"
                    f"**PR Body:**\n{result.get('pr_body', 'N/A')}\n\n"
                    f"**Changelog:** {result.get('changelog_entry', 'N/A')}\n\n"
                    f"**Commit Message:** `{result.get('commit_message', 'N/A')}`",
            metadata={
                "pr_title": result.get("pr_title", ""),
                "pr_body": result.get("pr_body", ""),
                "changelog_entry": result.get("changelog_entry", ""),
                "commit_message": result.get("commit_message", ""),
            },
        )

        return {
            "pr_title": result.get("pr_title", ""),
            "pr_body": result.get("pr_body", ""),
            "changelog_entry": result.get("changelog_entry", ""),
            "commit_message": result.get("commit_message", ""),
            "message": message,
        }
