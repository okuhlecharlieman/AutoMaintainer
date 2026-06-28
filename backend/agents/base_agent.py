from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from models import AgentRole, AgentMessage, PipelineRun
from services.llm import llm_registry, LLMClient
import logging

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    role: AgentRole
    name: str
    system_prompt: str

    # Subclasses can set this to request a specific model alias
    preferred_model: Optional[str] = None

    def __init__(self):
        self._llm: Optional[LLMClient] = None

    @property
    def llm(self) -> LLMClient:
        """Lazy-resolved LLM client, routed through the registry for this agent's role."""
        if self._llm is None:
            role_name = self.role.value if hasattr(self.role, "value") else str(self.role)
            self._llm = llm_registry.get_client_for_agent(role_name, self.preferred_model)
        return self._llm

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

    async def analyze(self, prompt: str, context: str = "", max_tokens: Optional[int] = None, call_timeout: Optional[int] = None) -> Dict[str, Any]:
        full_prompt = f"{prompt}\n\n{context}" if context else prompt
        return await self.llm.structured_chat(
            system_prompt=self.system_prompt,
            user_prompt=full_prompt,
            max_tokens=max_tokens,
            call_timeout=call_timeout,
        )
