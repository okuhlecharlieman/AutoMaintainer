from pydantic_settings import BaseSettings
from pydantic import BaseModel
from typing import Optional, Dict
from functools import lru_cache
import json


class ModelConfig(BaseModel):
    api_key: str
    base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    model: str = "qwen-plus"
    max_tokens: int = 4096
    temperature: float = 0.7


class Settings(BaseSettings):
    # Legacy single-model config (used as fallback when LLM_MODELS is not set)
    dashscope_api_key: str = ""
    qwen_model: str = "qwen-plus"

    # Multi-model config: JSON string mapping alias -> ModelConfig
    # Example: {"qwen-plus":{"api_key":"sk-..","model":"qwen-plus"},
    #           "gpt4o":{"api_key":"sk-..","base_url":"https://api.openai.com/v1","model":"gpt-4o"}}
    llm_models: str = ""

    # Which model alias to use by default (must exist in llm_models or fallback to legacy)
    default_model: str = "default"

    # Per-agent model overrides: JSON string mapping agent role -> model alias
    # Example: {"developer":"qwen-max","reviewer":"gpt4o"}
    agent_models: str = ""

    github_token: str = ""
    github_webhook_secret: str = ""

    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "sqlite+aiosqlite:///./automaintainer.db"

    sandbox_enabled: bool = True
    sandbox_timeout: int = 30

    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def get_model_configs(self) -> Dict[str, ModelConfig]:
        """Parse LLM_MODELS JSON into a dict of ModelConfig, with legacy fallback."""
        configs: Dict[str, ModelConfig] = {}

        if self.llm_models:
            try:
                raw = json.loads(self.llm_models)
                for alias, cfg in raw.items():
                    configs[alias] = ModelConfig(**cfg)
            except (json.JSONDecodeError, Exception) as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to parse LLM_MODELS: {e}")

        # If no models configured or default is missing, add legacy fallback
        if self.default_model not in configs and self.dashscope_api_key:
            configs[self.default_model] = ModelConfig(
                api_key=self.dashscope_api_key,
                model=self.qwen_model,
            )
        elif not configs and self.dashscope_api_key:
            configs["default"] = ModelConfig(
                api_key=self.dashscope_api_key,
                model=self.qwen_model,
            )

        return configs

    def get_agent_model(self, agent_role: str) -> str:
        """Get the model alias configured for a specific agent, or the default."""
        if self.agent_models:
            try:
                overrides = json.loads(self.agent_models)
                return overrides.get(agent_role, self.default_model)
            except json.JSONDecodeError:
                pass
        return self.default_model


@lru_cache()
def get_settings() -> Settings:
    return Settings()
