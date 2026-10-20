from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, CodeChange, AgentMessage
from services.llm import LLM_CALL_TIMEOUT_DEVELOPER
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

MAX_RETRIES = 1


class DeveloperAgent(BaseAgent):
    role = AgentRole.DEVELOPER
    name = "Developer"
    preferred_model = "nemotron-ultra"
    system_prompt = """You are an expert Developer agent in a multi-agent software engineering team.

Your responsibilities:
1. Implement code changes based on issue analysis and architecture plans
2. Follow existing code patterns and conventions in the repository
3. Write clean, well-structured, production-ready code
4. Handle edge cases appropriately
5. Follow the principle of minimal changes - only modify what's necessary

If context is insufficient, return an empty changes array and explain the blocker. Never invent existing file contents.

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

        existing_code = ""
        if file_contents:
            if sum(len(c) for c in file_contents.values()) > 240_000:
                raise ValueError("Relevant files exceed context budget; narrow the issue before generating changes")
            existing_code = "\n\n".join(
                f"### {path}\n```\n{content}\n```" for path, content in file_contents.items()
            )
        else:
            existing_code = "(No existing files. Only create explicitly requested new files.)"

        memory_context = ""
        if memory:
            memory_context = "## Repository Conventions\n" + "\n".join([
                f"- {m.content}" for m in memory[:5]
            ])

        # Follow-up context from previous failed attempts
        followup_context = ""
        prev_attempts = context.get("previous_attempts", [])
        if prev_attempts:
            followup_parts = ["## Previous Attempts (learn from these failures)"]
            for i, attempt in enumerate(prev_attempts, 1):
                followup_parts.append(
                    f"- Attempt {i}: Failed at {attempt.get('failed_at', '?')} — {attempt.get('error', 'unknown')}"
                )
            followup_parts.append("Avoid repeating these mistakes. Try a different approach if needed.")
            followup_context = "\n".join(followup_parts)

        dev_prompt = self._build_prompt(analysis_summary, arch_guidance, memory_context, existing_code, followup_context)
        dev_prompt = self._inject_custom_instructions(dev_prompt, context)

        # Try up to MAX_RETRIES+1 times to get non-empty code changes
        result = {}
        code_changes: List[CodeChange] = []
        last_error = ""

        for attempt in range(MAX_RETRIES + 1):
            try:
                if attempt > 0:
                    logger.info("Developer agent retry %d/%d for pipeline %s", attempt, MAX_RETRIES, pipeline.id)
                    retry_prompt = (
                        f"{dev_prompt}\n\n"
                        f"IMPORTANT: Previous attempt {attempt} produced no code changes. "
                        f"Only produce changes supported by the supplied complete files. "
                        f"Based on the issue analysis, implement the changes to the affected files listed above. "
                        f"If context is missing, explain the blocker instead of guessing."
                    )
                    result = await self.analyze(retry_prompt, max_tokens=16384, call_timeout=LLM_CALL_TIMEOUT_DEVELOPER)
                else:
                    result = await self.analyze(dev_prompt, max_tokens=16384, call_timeout=LLM_CALL_TIMEOUT_DEVELOPER)

                # Check for JSON parse failure signal from structured_chat
                if result.get("error") == "failed_to_parse_json":
                    raw = result.get("raw_response", "")
                    last_error = f"LLM returned non-JSON response: {raw[:200]}"
                    logger.warning("Developer agent attempt %d: %s", attempt + 1, last_error)
                    continue

                # Check for raw_response (legacy JSON parse failure)
                if "raw_response" in result and "changes" not in result:
                    raw = result.get("raw_response", "")
                    last_error = f"LLM returned non-JSON response: {raw[:200]}"
                    logger.warning("Developer agent attempt %d: %s", attempt + 1, last_error)
                    continue

                code_changes = self._parse_changes(result)
                if code_changes:
                    break

                last_error = "LLM returned empty changes array"
                logger.warning("Developer agent attempt %d: empty changes for pipeline %s", attempt + 1, pipeline.id)

            except Exception as e:
                last_error = str(e)
                logger.error("Developer agent attempt %d failed: %s", attempt + 1, e)

        if not code_changes:
            logger.error(
                "Developer agent failed to produce code changes after %d attempts for pipeline %s. Last error: %s",
                MAX_RETRIES + 1, pipeline.id, last_error,
            )

        from services.change_validation import validate_changes
        if sum(len(c.new_content) for c in code_changes) > 240_000:
            raise ValueError("Generated changes exceed review context budget")
        validate_changes(code_changes, file_contents, context.get("file_paths", set()))

        changes_summary = "\n".join([
            f"- **{c.change_type}** `{c.file_path}`" for c in code_changes
        ]) if code_changes else "No code changes were generated."

        status_note = ""
        if not code_changes:
            status_note = (
                f"\n\n**⚠️ Warning:** The Developer agent was unable to generate code changes "
                f"after {MAX_RETRIES + 1} attempts. Last error: {last_error}"
            )

        message = self.create_message(
            content=f"**Code Changes Implemented**\n\n"
                    f"**Approach:** {result.get('approach', 'N/A')}\n\n"
                    f"**Changes:**\n{changes_summary}\n\n"
                    f"**Summary:** {result.get('summary', 'N/A')}\n\n"
                    f"**Risks:** {', '.join(result.get('risks', ['None identified']))}"
                    f"{status_note}",
            metadata={"code_changes": [c.model_dump() for c in code_changes], "result": result},
            thinking=result.get("approach", ""),
        )

        return {"code_changes": code_changes, "message": message, "result": result}

    def _build_prompt(self, analysis_summary: str, arch_guidance: str, memory_context: str, existing_code: str, followup_context: str = "") -> str:
        followup_section = f"\n{followup_context}\n" if followup_context else ""
        return f"""Implement the fix for this issue.

{analysis_summary}
{arch_guidance}
{memory_context}
{followup_section}
## Existing Code
{existing_code}

## Instructions
1. Analyze the issue and existing code carefully
2. Implement the MINIMAL changes needed — only modify what is necessary
3. Follow the repository's existing code style and patterns
4. Return an empty changes array with an explanation if the fix cannot be safely determined
5. Always return the COMPLETE content of each changed file
6. Never use placeholders, ellipses, or omitted unchanged sections

Respond with JSON (and ONLY JSON, no markdown fences):
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

    def _parse_changes(self, result: Dict[str, Any]) -> List[CodeChange]:
        code_changes: List[CodeChange] = []
        for change_data in result.get("changes", []):
            if not isinstance(change_data, dict):
                continue
            file_path = change_data.get("file_path", "").strip()
            new_content = change_data.get("new_content", "")
            if not file_path or file_path == "unknown":
                continue
            code_changes.append(CodeChange(
                file_path=file_path,
                new_content=new_content,
                change_type=change_data.get("change_type", "modify"),
                language=self._detect_language(file_path),
            ))
        return code_changes

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
