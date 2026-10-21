from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from openai import NotFoundError, AuthenticationError, APIStatusError
from core.config import ModelConfig
from services.llm import LLMClient, FallbackLLMClient, LLMRegistry, ModelUnavailable


def client(model="nvidia/unavailable:free"):
    with patch("services.llm.AsyncOpenAI"):
        return LLMClient(ModelConfig(api_key="test", model=model))


def http_error(status):
    response = httpx.Response(status, request=httpx.Request("POST", "https://provider.example/chat"))
    cls = NotFoundError if status == 404 else AuthenticationError if status == 401 else APIStatusError
    return cls("provider error", response=response, body={})


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [404, 408, 500, 502, 503, 504])
async def test_unavailable_provider_is_classified_without_retry(status):
    primary = client()
    with patch.object(primary.client.chat.completions, "create", AsyncMock(side_effect=http_error(status))) as create:
        with pytest.raises(ModelUnavailable, match=f"HTTP {status}"):
            await primary.chat([])
    assert create.await_count == 1


@pytest.mark.asyncio
async def test_404_uses_configured_free_fallback():
    primary, fallback = client(), client("other/working:free")
    primary.chat = AsyncMock(side_effect=ModelUnavailable(primary.model, 404))
    fallback.chat = AsyncMock(return_value='{"summary":"ok"}')
    wrapped = FallbackLLMClient(primary, [fallback])
    assert await wrapped.structured_chat("system", "user") == {"summary": "ok"}
    fallback.chat.assert_awaited_once()


@pytest.mark.asyncio
async def test_free_primary_never_falls_back_to_paid_model():
    primary, paid = client(), client("other/paid")
    primary.chat = AsyncMock(side_effect=ModelUnavailable(primary.model, 404))
    paid.chat = AsyncMock(return_value="unexpected")
    with pytest.raises(RuntimeError, match="0 eligible"):
        await FallbackLLMClient(primary, [paid]).chat([])
    paid.chat.assert_not_called()


@pytest.mark.asyncio
async def test_fallback_404_advances_to_next_free_model():
    primary, second, third = client(), client("second:free"), client("third:free")
    primary.chat = AsyncMock(side_effect=ModelUnavailable(primary.model, 404))
    second.chat = AsyncMock(side_effect=ModelUnavailable(second.model, 404))
    third.chat = AsyncMock(return_value="ok")
    assert await FallbackLLMClient(primary, [second, third]).chat([]) == "ok"


@pytest.mark.asyncio
async def test_auth_error_does_not_trigger_provider_fallback():
    primary, fallback = client(), client("other:free")
    primary.chat = AsyncMock(side_effect=http_error(401))
    fallback.chat = AsyncMock()
    with pytest.raises(AuthenticationError):
        await FallbackLLMClient(primary, [fallback]).chat([])
    fallback.chat.assert_not_called()


def test_saved_model_overrides_preferred_and_updates_existing_agent():
    from agents.core_agents.developer import DeveloperAgent
    with patch.object(LLMRegistry, "_load_models"):
        registry = LLMRegistry()
    registry._clients = {"nemotron-ultra": client(), "replacement": client("other:free")}
    registry._fallback_order = list(registry._clients)
    agent = DeveloperAgent()
    with patch("agents.base_agent.llm_registry", registry):
        assert agent.llm._primary is registry._clients["nemotron-ultra"]
        registry.set_agent_models({"developer": "replacement"})
        assert agent.llm._primary is registry._clients["replacement"]
