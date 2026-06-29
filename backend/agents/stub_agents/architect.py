from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, AgentMessage
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class ArchitectAgent(BaseAgent):
    role = AgentRole.ARCHITECT
    name = "Architect"
    system_prompt = """You are an expert Software Architect agent. You analyze project structure,
recommend implementation approaches, and ensure architectural integrity.
Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        analysis = context.get("analysis")
        file_tree = context.get("file_tree", "")
        memory = context.get("memory", [])

        arch_prompt = f"""Analyze the architecture for implementing this fix.

## Issue
{pipeline.issue_title}: {analysis.summary if analysis else 'N/A'}

## File Structure
{file_tree[:2000]}

## Affected Files
{', '.join(analysis.affected_files) if analysis else 'N/A'}

## Repository Conventions
{chr(10).join([f'- {m.content}' for m in memory[:5]]) if memory else 'No conventions recorded.'}

Respond with JSON:
{{
    "approach": "description of recommended approach",
    "patterns": ["pattern to follow 1", "pattern to follow 2"],
    "warnings": ["potential architectural concern 1"],
    "dependencies": ["module that may need changes"],
    "complexity_assessment": "low|medium|high",
    "reasoning": "architectural reasoning"
}}"""

        arch_prompt = self._inject_custom_instructions(arch_prompt, context)
        result = await self.analyze(arch_prompt)

        message = self.create_message(
            content=f"**Architecture Analysis Complete**\n\n"
                    f"**Approach:** {result.get('approach', 'N/A')}\n\n"
                    f"**Patterns to Follow:**\n" +
                    "\n".join([f"- {p}" for p in result.get("patterns", [])]) +
                    f"\n\n**Warnings:**\n" +
                    "\n".join([f"- ⚠️ {w}" for w in result.get("warnings", [])]),
            metadata={"architecture_plan": result},
            thinking=result.get("reasoning", ""),
        )

        return {"architecture_plan": result, "message": message}
