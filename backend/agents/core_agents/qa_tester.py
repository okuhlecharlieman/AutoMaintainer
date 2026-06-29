from agents.base_agent import BaseAgent
from models import AgentRole, PipelineRun, TestResult, AgentMessage
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class QATesterAgent(BaseAgent):
    role = AgentRole.QA_TESTER
    name = "QA Tester"
    system_prompt = """You are an expert QA/Test agent in a multi-agent software engineering team.

Your responsibilities:
1. Generate comprehensive tests for code changes
2. Identify edge cases and potential failure modes
3. Validate that changes meet the requirements
4. Check for regressions in related functionality
5. Ensure test coverage for new code paths

You write tests that are practical, focused, and follow the repository's testing conventions.
Always respond in valid JSON format."""

    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        code_changes = context.get("code_changes", [])
        analysis = context.get("analysis")
        existing_tests = context.get("existing_tests", "")
        test_framework = context.get("test_framework", "pytest")

        changes_desc = "\n\n".join([
            f"### {c.file_path} ({c.change_type})\n```{c.language or ''}\n{c.new_content[:2000]}\n```"
            for c in code_changes
        ])

        requirements = ""
        if analysis:
            requirements = "\n".join([f"- {r}" for r in analysis.requirements])

        qa_prompt = f"""Generate and evaluate tests for these code changes.

## Requirements Being Addressed
{requirements}

## Code Changes
{changes_desc}

## Existing Test Patterns
{existing_tests[:2000] if existing_tests else 'No existing test patterns found.'}

## Test Framework
{test_framework}

Provide your response as JSON:
{{
    "tests": [
        {{
            "test_name": "test_descriptive_name",
            "test_code": "full test code",
            "description": "what this test validates",
            "category": "unit|integration|edge_case"
        }}
    ],
    "test_results": [
        {{
            "test_name": "test_name",
            "passed": true,
            "output": "test output or validation result",
            "duration_ms": 42,
            "error_message": null
        }}
    ],
    "coverage_assessment": "brief assessment of test coverage",
    "edge_cases_found": ["edge case 1"],
    "confidence": 0.85,
    "recommendations": ["recommendation 1"]
}}"""

        qa_prompt = self._inject_custom_instructions(qa_prompt, context)
        result = await self.analyze(qa_prompt)

        test_results: List[TestResult] = []
        for tr in result.get("test_results", []):
            test_results.append(TestResult(
                test_name=tr.get("test_name", "unknown"),
                passed=tr.get("passed", False),
                output=tr.get("output", ""),
                duration_ms=tr.get("duration_ms"),
                error_message=tr.get("error_message"),
            ))

        passed = sum(1 for t in test_results if t.passed)
        total = len(test_results)

        tests_list = result.get("tests", [])
        tests_desc = "\n".join([
            f"- **{t.get('test_name', 'unknown')}** ({t.get('category', 'unit')}): {t.get('description', 'N/A')}"
            for t in tests_list
        ])

        results_desc = "\n".join([
            f"- {'✅' if t.passed else '❌'} **{t.test_name}**: {t.output[:100]}"
            for t in test_results
        ])

        message = self.create_message(
            content=f"**Test Generation & Validation Complete**\n\n"
                    f"**Tests Generated:** {len(tests_list)}\n"
                    f"**Results:** {passed}/{total} passed\n\n"
                    f"**Tests:**\n{tests_desc}\n\n"
                    f"**Results:**\n{results_desc}\n\n"
                    f"**Coverage:** {result.get('coverage_assessment', 'N/A')}\n"
                    f"**Confidence:** {result.get('confidence', 'N/A')}",
            metadata={
                "tests": tests_list,
                "test_results": [t.model_dump() for t in test_results],
                "confidence": result.get("confidence", 0),
            },
            thinking=result.get("coverage_assessment", ""),
        )

        return {
            "test_results": test_results,
            "tests": tests_list,
            "message": message,
            "confidence": result.get("confidence", 0),
        }
