from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from models import AgentRole, AgentMessage, PipelineRun
from services.llm import qwen_client
import logging

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    role: AgentRole
    name: str
    system_prompt: str

    def __init__(self):
        self.llm = qwen_client

    @abstractmethod
    async def execute(self, pipeline: PipelineRun, context: Dict[str, Any]) -> Dict[str, Any]:
        pass

    async def think(self, pipeline: PipelineRun, context: Dict[str, Any]) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": self._build_thinking_prompt(pipeline, context)},
        ]
        return await self.llm.chat(messages, temperature=0.3)

    def _build_thinking_prompt(self, pipeline: PipelineRun, context: Dict[str, Any]) -> str:
        return f"Analyze the current state of this pipeline run and share your reasoning.\n\nPipeline: {pipeline.issue_title}\nStatus: {pipeline.status}"

    def create_message(self, content: str, metadata: Dict[str, Any] = None, thinking: str = None) -> AgentMessage:
        return AgentMessage(
            agent_role=self.role,
            content=content,
            metadata=metadata or {},
            thinking=thinking,
        )

    async def analyze(self, prompt: str, context: str = "") -> Dict[str, Any]:
        full_prompt = f"{prompt}\n\n{context}" if context else prompt
        return await self.llm.structured_chat(
            system_prompt=self.system_prompt,
            user_prompt=full_prompt,
        )
