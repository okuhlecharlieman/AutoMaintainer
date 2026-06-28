from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, SecurityFinding, AgentMessage
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class SecurityAgent(BaseAgent):
    role = AgentRole.SECURITY
    name = "Security Scanner"
    system_prompt = """You are a Security Analysis agent. You scan code changes for vulnerabilities,
insecure patterns, and potential security risks.
Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        code_changes = context.get("code_changes", [])

        changes_desc = "\n\n".join([
            f"### {c.file_path}\n```{c.language or ''}\n{c.new_content[:2000]}\n```"
            for c in code_changes
        ])

        security_prompt = f"""Scan these code changes for security vulnerabilities.

## Code Changes
{changes_desc}

Respond with JSON:
{{
    "findings": [
        {{
            "severity": "critical|high|medium|low|info",
            "category": "injection|xss|auth|data_exposure|dependency|other",
            "description": "description of the finding",
            "file_path": "affected file",
            "line_number": null,
            "recommendation": "how to fix"
        }}
    ],
    "safe": true/false,
    "summary": "overall security assessment",
    "dependency_risks": ["any dependency concerns"]
}}"""

        security_prompt = self._inject_custom_instructions(security_prompt, context)
        result = await self.analyze(security_prompt)

        findings: List[SecurityFinding] = []
        for f in result.get("findings", []):
            findings.append(SecurityFinding(
                severity=f.get("severity", "info"),
                category=f.get("category", "other"),
                description=f.get("description", ""),
                file_path=f.get("file_path"),
                line_number=f.get("line_number"),
                recommendation=f.get("recommendation", ""),
            ))

        findings_desc = "\n".join([
            f"- **[{f.severity.upper()}]** {f.description}" for f in findings
        ]) if findings else "- ✅ No security issues detected"

        message = self.create_message(
            content=f"**Security Scan Complete** {'✅' if result.get('safe', True) else '⚠️'}\n\n"
                    f"**Findings:** {len(findings)}\n\n"
                    f"{findings_desc}\n\n"
                    f"**Summary:** {result.get('summary', 'N/A')}",
            metadata={
                "findings": [f.model_dump() for f in findings],
                "safe": result.get("safe", True),
            },
            thinking=result.get("summary", ""),
        )

        return {
            "security_findings": findings,
            "security_safe": result.get("safe", True),
            "message": message,
        }
