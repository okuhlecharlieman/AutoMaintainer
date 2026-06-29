from openai import AsyncOpenAI
from typing import List, Dict, Any, Optional
from core.config import get_settings, ModelConfig
import asyncio
import json
import re
import logging

logger = logging.getLogger(__name__)

RATE_LIMIT_RETRIES = 2
RATE_LIMIT_BASE_DELAY = 5
LLM_CALL_TIMEOUT = 90  # seconds — default max time for a single LLM API call
LLM_CALL_TIMEOUT_DEVELOPER = 120  # seconds — longer timeout for large models (Developer agent)
LLM_CALL_TIMEOUT_FALLBACK = 60  # seconds — shorter timeout for fallback models (should be faster)


class RateLimitExhausted(Exception):
    """All retries exhausted due to rate limiting on a specific model."""

    def __init__(self, model: str, original_error: Exception):
        self.model = model
        self.original_error = original_error
        super().__init__(f"Rate limit exhausted on {model} after retries: {original_error}")


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
        call_timeout: Optional[int] = None,
    ) -> str:
        timeout = call_timeout or LLM_CALL_TIMEOUT
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature or self.config.temperature,
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if response_format:
            kwargs["response_format"] = response_format

        last_error: Optional[Exception] = None
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(**kwargs),
                    timeout=timeout,
                )
                return response.choices[0].message.content or ""
            except asyncio.TimeoutError:
                logger.error("LLM call to %s timed out after %ds", self.model, timeout)
                raise TimeoutError(f"LLM call to {self.model} timed out after {timeout}s")
            except Exception as e:
                error_str = str(e)
                is_rate_limit = "429" in error_str or "rate" in error_str.lower()
                if is_rate_limit:
                    last_error = e
                    if attempt < RATE_LIMIT_RETRIES:
                        delay = RATE_LIMIT_BASE_DELAY * (attempt + 1)
                        if hasattr(e, 'response') and e.response is not None:
                            try:
                                body = e.response.json()
                                hint = body.get("error", {}).get("metadata", {}).get("retry_after_seconds", delay)
                                delay = max(int(hint), RATE_LIMIT_BASE_DELAY)
                            except Exception:
                                pass
                        logger.warning(
                            "Rate limited on %s (attempt %d/%d), retrying in %ds",
                            self.model, attempt + 1, RATE_LIMIT_RETRIES, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    # All retries exhausted — raise specific exception for fallback
                    raise RateLimitExhausted(self.model, e) from e
                logger.error(f"LLM API error ({self.model}): {e}")
                raise
        # Should not reach here, but just in case
        raise RateLimitExhausted(self.model, last_error or RuntimeError("Unknown rate limit error"))

    async def structured_chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        retries: int = 1,
        call_timeout: Optional[int] = None,
    ) -> Dict[str, Any]:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        output = ""
        for attempt in range(retries + 1):
            output = await self.chat(
                messages=messages,
                temperature=temperature or 0.3,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
                call_timeout=call_timeout,
            )
            parsed = self._extract_json(output)
            if parsed is not None:
                return parsed

            logger.warning(
                "Attempt %d/%d: Failed to parse JSON from %s — len=%d, raw[:200]: %s",
                attempt + 1, retries + 1, self.model, len(output), output[:200],
            )

            if attempt < retries:
                # Fresh retry with shorter reinforcement (don't append old response to avoid bloat)
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown fences, no extra text. Keep the response concise."},
                ]

        logger.error("All %d attempts to get valid JSON failed for %s", retries + 1, self.model)
        return {"raw_response": output[:2000], "error": "failed_to_parse_json"}

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Try to extract JSON from an LLM response, handling markdown fences, prose wrappers, and truncation."""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Strip markdown code fences (```json ... ``` or ``` ... ```)
        fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if fence_match:
            try:
                return json.loads(fence_match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # Find first { ... } block that parses as JSON
        brace_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass

        # Broader greedy brace match for deeply nested JSON
        greedy_match = re.search(r"\{.*\}", text, re.DOTALL)
        if greedy_match:
            try:
                return json.loads(greedy_match.group(0))
            except json.JSONDecodeError:
                pass

        # Try to repair truncated JSON by closing open braces/brackets
        repaired = self._repair_truncated_json(text)
        if repaired is not None:
            return repaired

        return None

    def _repair_truncated_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Attempt to repair truncated JSON by closing open structures."""
        # Find the start of JSON
        start = text.find('{')
        if start == -1:
            return None

        candidate = text[start:]
        # Try progressively closing open brackets/braces
        for closing in ['"}]}', '"}]', '"}', '}]}', '}]', '}']:
            try:
                return json.loads(candidate + closing)
            except json.JSONDecodeError:
                continue

        # More aggressive: try to find the last complete "changes" entry
        # and close the array
        try:
            last_brace = candidate.rfind('}')
            if last_brace > 0:
                truncated = candidate[:last_brace + 1]
                for closing in [']}', ']}]}', ']}}']:
                    try:
                        return json.loads(truncated + closing)
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass

        return None

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


class FallbackLLMClient(LLMClient):
    """Wraps a primary LLMClient with automatic fallback to other models on rate limits."""

    def __init__(self, primary: LLMClient, fallbacks: List[LLMClient]):
        # Initialize with primary's config
        super().__init__(primary.config)
        self._primary = primary
        self._fallbacks = fallbacks

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict] = None,
        call_timeout: Optional[int] = None,
    ) -> str:
        try:
            return await self._primary.chat(messages, temperature, max_tokens, response_format, call_timeout)
        except (RateLimitExhausted, TimeoutError) as e:
            is_timeout = isinstance(e, TimeoutError)
            reason = "timed out" if is_timeout else "exhausted rate limits"
            logger.warning("Model %s %s, trying fallbacks...", self._primary.model, reason)
            # Use shorter timeout for fallback models — they should be smaller/faster
            fallback_timeout = LLM_CALL_TIMEOUT_FALLBACK
            for fb in self._fallbacks:
                try:
                    logger.info("Falling back to %s (timeout=%ds)", fb.model, fallback_timeout)
                    return await fb.chat(messages, temperature, max_tokens, response_format, fallback_timeout)
                except RateLimitExhausted:
                    logger.warning("Fallback %s also rate-limited, trying next...", fb.model)
                    continue
                except TimeoutError:
                    logger.warning("Fallback %s also timed out, trying next...", fb.model)
                    continue
                except Exception as fb_err:
                    logger.warning("Fallback %s failed: %s", fb.model, fb_err)
                    continue
            # All fallbacks exhausted
            raise RuntimeError(
                f"All models failed ({reason}). Primary: {self._primary.model}. "
                f"Tried {len(self._fallbacks)} fallback(s). "
                f"Please wait a few minutes and retry."
            ) from e


class LLMRegistry:
    """Manages multiple LLM clients and routes requests to the right model."""

    def __init__(self):
        self._clients: Dict[str, LLMClient] = {}
        self._fallback_order: List[str] = []
        self._runtime_agent_models: Dict[str, str] = {}
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

    def _get_fallbacks(self, exclude_alias: str) -> List[LLMClient]:
        """Get all clients except the given alias, in registration order."""
        return [
            self._clients[alias]
            for alias in self._fallback_order
            if alias != exclude_alias and alias in self._clients
        ]

    def get_client(self, alias: Optional[str] = None) -> LLMClient:
        """Get a client by alias with automatic fallback on rate limits."""
        settings = get_settings()

        # Resolve the primary alias
        primary_alias = None
        if alias and alias in self._clients:
            primary_alias = alias
        elif settings.default_model in self._clients:
            primary_alias = settings.default_model
            if alias:
                logger.warning(f"Model '{alias}' not found, falling back to '{primary_alias}'")
        elif self._fallback_order:
            primary_alias = self._fallback_order[0]
            logger.warning(f"Model '{alias or settings.default_model}' not found, falling back to '{primary_alias}'")

        if not primary_alias:
            raise RuntimeError("No LLM models configured")

        primary = self._clients[primary_alias]
        fallbacks = self._get_fallbacks(primary_alias)
        if fallbacks:
            return FallbackLLMClient(primary, fallbacks)
        return primary

    def get_client_for_agent(self, agent_role: str, preferred_model: Optional[str] = None) -> LLMClient:
        """Resolve the best client for a given agent, with fallback on rate limits."""
        settings = get_settings()

        # Determine primary alias — check runtime overrides first
        primary_alias = None
        if preferred_model and preferred_model in self._clients:
            primary_alias = preferred_model
        else:
            if preferred_model:
                logger.warning(f"Preferred model '{preferred_model}' for {agent_role} not found")
            # Runtime overrides take priority over env vars
            runtime_alias = self._runtime_agent_models.get(agent_role)
            if runtime_alias and runtime_alias in self._clients:
                primary_alias = runtime_alias
            else:
                agent_alias = settings.get_agent_model(agent_role)
                if agent_alias in self._clients:
                    primary_alias = agent_alias

        if not primary_alias:
            return self.get_client()

        primary = self._clients[primary_alias]
        fallbacks = self._get_fallbacks(primary_alias)
        if fallbacks:
            return FallbackLLMClient(primary, fallbacks)
        return primary

    def get_agent_models(self) -> Dict[str, str]:
        """Get effective agent-model assignments (runtime overrides + env defaults)."""
        settings = get_settings()
        roles = ["developer", "reviewer", "architect", "issue_analyst", "qa_tester", "security", "documentation"]
        result = {}
        for role in roles:
            runtime_alias = self._runtime_agent_models.get(role)
            if runtime_alias and runtime_alias in self._clients:
                result[role] = runtime_alias
            else:
                result[role] = settings.get_agent_model(role)
        return result

    def resolve_model_for_role(self, agent_role: str) -> str:
        """Return a human-readable 'alias (model_slug)' string for the agent's current model."""
        models = self.get_agent_models()
        alias = models.get(agent_role, "unknown")
        client = self._clients.get(alias)
        if client:
            return f"{alias} ({client.model})"
        return alias

    def set_agent_models(self, overrides: Dict[str, str]) -> Dict[str, str]:
        """Update runtime agent-model assignments. Returns the effective assignments."""
        valid_aliases = set(self._clients.keys())
        for role, alias in overrides.items():
            if alias not in valid_aliases:
                raise ValueError(f"Unknown model alias '{alias}'. Available: {sorted(valid_aliases)}")
            self._runtime_agent_models[role] = alias
        return self.get_agent_models()

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
