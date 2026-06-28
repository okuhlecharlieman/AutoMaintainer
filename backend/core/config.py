from __future__ import annotations

import json
import logging
import warnings
from functools import lru_cache
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class ModelConfig(BaseModel):
    api_key: str = Field(..., min_length=1)
    base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    model: str = "qwen-plus"
    max_tokens: int = Field(default=4096, ge=1, le=262_144)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class Settings(BaseSettings):
    # ── LLM Configuration ──────────────────────────────────────────────
    # Legacy single-model config (used as fallback when LLM_MODELS is not set)
    dashscope_api_key: str = ""
    qwen_model: str = "qwen-plus"

    # Multi-model config: JSON string mapping alias -> ModelConfig
    llm_models: str = ""

    # Which model alias to use by default
    default_model: str = "default"

    # Per-agent model overrides: JSON string mapping agent role -> model alias
    agent_models: str = ""

    # ── GitHub ─────────────────────────────────────────────────────────
    github_token: str = ""
    github_webhook_secret: str = ""

    # ── GitHub OAuth ───────────────────────────────────────────────────
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""
    github_oauth_redirect_uri: str = ""

    # ── Frontend URL (for OAuth redirect back to frontend after login) ──
    frontend_url: str = "http://localhost:3000"

    # ── Infrastructure ─────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "sqlite+aiosqlite:///./automaintainer.db"

    # ── Auth ───────────────────────────────────────────────────────────
    auth_enabled: bool = True  # Secure default: auth ON in production
    auth_token: str = ""  # Static API key (also accepted as alternative to JWT)
    jwt_secret: str = ""  # Secret for signing JWT tokens; auto-generated if empty
    jwt_expiration_hours: int = Field(default=24, ge=1, le=168)  # Token lifetime (1–168 hours)
    admin_username: str = "admin"
    admin_password: str = ""  # Must be set when auth_enabled=True

    # ── Sandbox ────────────────────────────────────────────────────────
    sandbox_enabled: bool = True
    sandbox_timeout: int = Field(default=30, ge=5, le=300)

    # ── Server ─────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    cors_origins: str = "http://localhost:3000"

    # ── Pipeline limits ────────────────────────────────────────────────
    max_concurrent_pipelines: int = Field(default=3, ge=1, le=10)
    pipeline_timeout_seconds: int = Field(default=600, ge=60, le=3600)

    # ── Agent timeouts (seconds) ──────────────────────────────────────
    # Per-agent timeout: JSON mapping agent role -> seconds, or single int for all
    agent_timeout_default: int = Field(default=120, ge=30, le=600)
    agent_timeout_developer: int = Field(default=420, ge=60, le=900)

    # ── Request limits ─────────────────────────────────────────────────
    max_request_size_mb: int = Field(default=10, ge=1, le=100)

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("auth_token")
    @classmethod
    def validate_auth_token(cls, v: str, info) -> str:
        # Note: admin_password is validated in the model_validator below,
        # because it's defined after auth_token and isn't available here.
        if info.data.get("auth_enabled") and not v:
            # Will be re-checked in model_validator with full context
            pass
        return v

    @model_validator(mode="after")
    def validate_auth_config(self) -> "Settings":
        if self.auth_enabled and not self.auth_token and not self.admin_password:
            warnings.warn(
                "AUTH_ENABLED is True but both AUTH_TOKEN and ADMIN_PASSWORD are empty. "
                "All requests will be rejected. Set AUTH_TOKEN, ADMIN_PASSWORD, or disable AUTH_ENABLED.",
                UserWarning,
            )
        return self

    @model_validator(mode="after")
    def validate_github_token_if_needed(self) -> "Settings":
        # GitHub token is required for any real pipeline execution
        if not self.github_token:
            logger.warning(
                "GITHUB_TOKEN is not set. Pipeline execution will fail "
                "when attempting to interact with GitHub."
            )
        return self

    def get_model_configs(self) -> Dict[str, ModelConfig]:
        """Parse LLM_MODELS JSON into a dict of ModelConfig, with legacy fallback."""
        configs: Dict[str, ModelConfig] = {}

        if self.llm_models:
            try:
                raw = json.loads(self.llm_models)
                for alias, cfg in raw.items():
                    configs[alias] = ModelConfig(**cfg)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Failed to parse LLM_MODELS: {e}")

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
            except (json.JSONDecodeError, TypeError):
                pass
        return self.default_model


@lru_cache()
def get_settings() -> Settings:
    return Settings()
