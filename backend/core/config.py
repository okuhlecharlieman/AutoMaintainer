from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    dashscope_api_key: str = ""
    qwen_model: str = "qwen-plus"
    
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


@lru_cache()
def get_settings() -> Settings:
    return Settings()
