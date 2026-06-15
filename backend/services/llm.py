from openai import AsyncOpenAI
from typing import List, Dict, Any, Optional
from core.config import get_settings, ModelConfig
import json
import re
import logging

logger = logging.getLogger(__name__)


class LLMClient:
    """Client for a single LLM provider/model combination."""

    def __init__(self, config: ModelConfig):
        self.config = config
        self.client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
        )
        self.model = config.model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict] = None,
    ) -> str:
        try:
            kwargs: Dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature or self.config.temperature,
                "max_tokens": max_tokens or self.config.max_tokens,
            }
            if response_format:
                kwargs["response_format"] = response_format

            response = await self.client.chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM API error ({self.model}): {e}")
            raise

    async def structured_chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        output = await self.chat(
            messages=messages,
            temperature=temperature or 0.3,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            # Try stripping markdown code fences (```json ... ```)
            stripped = re.sub(r'^```(?:json)?\s*\n?', '', output.strip(), flags=re.MULTILINE)
            stripped = re.sub(r'\n?```\s*$', '', stripped.strip(), flags=re.MULTILINE)
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse JSON response: {output[:200]}")
                return {"raw_response": output}

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
    ):
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature or self.config.temperature,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"LLM streaming error ({self.model}): {e}")
            raise


class LLMRegistry:
    """Manages multiple LLM clients and routes requests to the right model."""

    def __init__(self):
        self._clients: Dict[str, LLMClient] = {}
        self._fallback_order: List[str] = []
        self._load_models()

    def _load_models(self):
        settings = get_settings()
        configs = settings.get_model_configs()

        for alias, config in configs.items():
            self._clients[alias] = LLMClient(config)
            self._fallback_order.append(alias)
            logger.info(f"Registered LLM '{alias}' -> {config.model} @ {config.base_url}")

        if not self._clients:
            logger.warning("No LLM models configured. Check DASHSCOPE_API_KEY or LLM_MODELS.")

    def get_client(self, alias: Optional[str] = None) -> LLMClient:
        """Get a client by alias, falling back to the default or first available."""
        settings = get_settings()

        # Try requested alias
        if alias and alias in self._clients:
            return self._clients[alias]

        # Try default model
        default = settings.default_model
        if default in self._clients:
            if alias:
                logger.warning(f"Model '{alias}' not found, falling back to '{default}'")
            return self._clients[default]

        # Fall back to first registered client
        if self._fallback_order:
            fallback = self._fallback_order[0]
            logger.warning(f"Model '{alias or default}' not found, falling back to '{fallback}'")
            return self._clients[fallback]

        raise RuntimeError("No LLM models configured")

    def get_client_for_agent(self, agent_role: str, preferred_model: Optional[str] = None) -> LLMClient:
        """Resolve the best client for a given agent."""
        settings = get_settings()

        # Agent's own preference takes priority
        if preferred_model:
            if preferred_model in self._clients:
                return self._clients[preferred_model]
            logger.warning(f"Preferred model '{preferred_model}' for {agent_role} not found")

        # Check per-agent config override
        agent_alias = settings.get_agent_model(agent_role)
        if agent_alias in self._clients:
            return self._clients[agent_alias]

        return self.get_client()

    def list_models(self) -> List[Dict[str, str]]:
        """List all registered models with their details."""
        result = []
        settings = get_settings()
        for alias, client in self._clients.items():
            result.append({
                "alias": alias,
                "model": client.model,
                "base_url": client.config.base_url,
                "is_default": alias == settings.default_model,
            })
        return result


# Module-level singleton
llm_registry = LLMRegistry()

# Backward-compatible alias
qwen_client = None  # Deprecated: use llm_registry.get_client() instead


def get_llm(model: Optional[str] = None) -> LLMClient:
    """Convenience function to get an LLM client."""
    return llm_registry.get_client(model)
