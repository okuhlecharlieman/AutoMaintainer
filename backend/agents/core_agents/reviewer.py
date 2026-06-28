from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, ReviewScore, AgentMessage
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class ReviewerAgent(BaseAgent):
    role = AgentRole.REVIEWER
    name = "Code Reviewer"
    system_prompt = """You are an expert Code Reviewer agent in a multi-agent software engineering team.

Your responsibilities:
1. Critique code changes for correctness, readability, and maintainability
2. Check adherence to project conventions and best practices
3. Identify potential bugs, security issues, and performance problems
4. Score code quality across multiple dimensions
5. Provide actionable improvement suggestions

You are thorough but fair. You approve code that meets quality standards and request changes when needed.
Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        code_changes = context.get("code_changes", [])
        analysis = context.get("analysis")
        test_results = context.get("test_results", [])
        security_findings = context.get("security_findings", [])

        changes_desc = "\n\n".join([
            f"### {c.file_path} ({c.change_type})\n```{c.language or ''}\n{c.new_content[:2000]}\n```"
            for c in code_changes
        ])

        test_summary = "\n".join([
            f"- {'PASS' if t.passed else 'FAIL'}: {t.test_name}" for t in test_results
        ])

        security_summary = ""
        if security_findings:
            security_summary = "\n".join([
                f"- [{f.severity}] {f.description}" for f in security_findings
            ])

        review_prompt = f"""Review these code changes thoroughly.

## Issue Context
- Title: {pipeline.issue_title}
- Summary: {analysis.summary if analysis else 'N/A'}
- Requirements: {', '.join(analysis.requirements) if analysis else 'N/A'}

## Code Changes
{changes_desc}

## Test Results
{test_summary if test_summary else 'No tests run.'}

## Security Findings
{security_summary if security_summary else 'No security issues found.'}

Provide your review as JSON:
{{
    "approved": true/false,
    "readability": 8.5,
    "maintainability": 7.0,
    "security": 9.0,
    "performance": 8.0,
    "overall": 8.1,
    "comments": ["comment about the code"],
    "suggestions": ["suggestion for improvement"],
    "critical_issues": ["any blocking issues"],
    "verdict": "approved|changes_requested|rejected",
    "summary": "overall review summary"
}}

Score each dimension 0-10. Be honest but constructive."""

        review_prompt = self._inject_custom_instructions(review_prompt, context)
        result = await self.analyze(review_prompt)

        review_score = ReviewScore(
            readability=float(result.get("readability", 0)),
            maintainability=float(result.get("maintainability", 0)),
            security=float(result.get("security", 0)),
            performance=float(result.get("performance", 0)),
            overall=float(result.get("overall", 0)),
            comments=result.get("comments", []),
            suggestions=result.get("suggestions", []),
        )

        verdict = result.get("verdict", "changes_requested")
        verdict_emoji = {"approved": "✅", "changes_requested": "🔄", "rejected": "❌"}.get(verdict, "❓")

        comments_desc = "\n".join([f"- {c}" for c in review_score.comments])
        suggestions_desc = "\n".join([f"- {s}" for s in review_score.suggestions])

        message = self.create_message(
            content=f"**Code Review Complete** {verdict_emoji}\n\n"
                    f"**Verdict:** {verdict.replace('_', ' ').title()}\n\n"
                    f"**Scores:**\n"
                    f"- Readability: {review_score.readability}/10\n"
                    f"- Maintainability: {review_score.maintainability}/10\n"
                    f"- Security: {review_score.security}/10\n"
                    f"- Performance: {review_score.performance}/10\n"
                    f"- **Overall: {review_score.overall}/10**\n\n"
                    f"**Comments:**\n{comments_desc}\n\n"
                    f"**Suggestions:**\n{suggestions_desc}",
            metadata={
                "review_score": review_score.model_dump(),
                "approved": result.get("approved", False),
                "verdict": verdict,
                "critical_issues": result.get("critical_issues", []),
            },
            thinking=result.get("summary", ""),
        )

        return {
            "review_score": review_score,
            "approved": result.get("approved", False),
            "verdict": verdict,
            "message": message,
        }
