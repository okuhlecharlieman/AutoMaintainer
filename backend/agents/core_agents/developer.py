from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, CodeChange, AgentMessage
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class DeveloperAgent(BaseAgent):
    role = AgentRole.DEVELOPER
    name = "Developer"
    system_prompt = """You are an expert Developer agent in a multi-agent software engineering team.

Your responsibilities:
1. Implement code changes based on issue analysis and architecture plans
2. Follow existing code patterns and conventions in the repository
3. Write clean, well-structured, production-ready code
4. Handle edge cases appropriately
5. Follow the principle of minimal changes - only modify what's necessary

You always respond with valid JSON containing the code changes."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        analysis = context.get("analysis")
        architecture_plan = context.get("architecture_plan", {})
        file_contents = context.get("file_contents", {})
        memory = context.get("memory", [])

        analysis_summary = ""
        if analysis:
            analysis_summary = f"""
## Issue Analysis
- Summary: {analysis.summary}
- Requirements: {', '.join(analysis.requirements)}
- Affected files: {', '.join(analysis.affected_files)}
- Severity: {analysis.severity.value}
- Type: {analysis.issue_type.value}
"""

        arch_guidance = ""
        if architecture_plan:
            arch_guidance = f"""
## Architecture Guidance
- Approach: {architecture_plan.get('approach', 'N/A')}
- Patterns to follow: {', '.join(architecture_plan.get('patterns', []))}
- Warnings: {', '.join(architecture_plan.get('warnings', []))}
"""

        existing_code = "\n\n".join([
            f"### {path}\n```\n{content}\n```"
            for path, content in list(file_contents.items())[:10]
        ])

        memory_context = ""
        if memory:
            memory_context = "## Repository Conventions\n" + "\n".join([
                f"- {m.content}" for m in memory[:5]
            ])

        dev_prompt = f"""Implement the fix for this issue.

{analysis_summary}
{arch_guidance}
{memory_context}

## Existing Code
{existing_code}

## Instructions
1. Analyze the issue and existing code carefully
2. Implement the minimal changes needed to fix the issue
3. Follow the repository's existing code style and patterns
4. Add appropriate error handling

Respond with JSON:
{{
    "changes": [
        {{
            "file_path": "path/to/file",
            "change_type": "modify|create|delete",
            "new_content": "complete file content after changes",
            "explanation": "what this change does and why"
        }}
    ],
    "summary": "brief summary of all changes made",
    "approach": "description of your implementation approach",
    "risks": ["potential risk 1", "potential risk 2"]
}}"""

        result = await self.analyze(dev_prompt)

        code_changes: List[CodeChange] = []
        for change_data in result.get("changes", []):
            code_changes.append(CodeChange(
                file_path=change_data.get("file_path", "unknown"),
                new_content=change_data.get("new_content", ""),
                change_type=change_data.get("change_type", "modify"),
                language=self._detect_language(change_data.get("file_path", "")),
            ))

        changes_summary = "\n".join([
            f"- **{c.change_type}** `{c.file_path}`" for c in code_changes
        ])

        message = self.create_message(
            content=f"**Code Changes Implemented**\n\n"
                    f"**Approach:** {result.get('approach', 'N/A')}\n\n"
                    f"**Changes:**\n{changes_summary}\n\n"
                    f"**Summary:** {result.get('summary', 'N/A')}\n\n"
                    f"**Risks:** {', '.join(result.get('risks', ['None identified']))}",
            metadata={"code_changes": [c.model_dump() for c in code_changes], "result": result},
            thinking=result.get("approach", ""),
        )

        return {"code_changes": code_changes, "message": message, "result": result}

    def _detect_language(self, file_path: str) -> str:
        ext_map = {
            ".py": "python", ".js": "javascript", ".ts": "typescript",
            ".tsx": "tsx", ".jsx": "jsx", ".java": "java",
            ".go": "go", ".rs": "rust", ".rb": "ruby",
            ".css": "css", ".html": "html", ".json": "json",
        }
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "text"
