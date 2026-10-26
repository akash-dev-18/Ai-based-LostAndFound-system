from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Lost & Found API"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str = (
        "postgresql+asyncpg://lostfound:lostfound@localhost:5432/lostfound"
    )
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_url: str | None = None

    cache_enabled: bool = True
    cache_item_list_ttl_seconds: int = Field(default=30, ge=1, le=300)
    cache_item_detail_ttl_seconds: int = Field(default=60, ge=1, le=300)
    cache_rag_ttl_seconds: int = Field(default=60, ge=1, le=300)

    rate_limit_enabled: bool = True
    rate_limit_login_per_minute: int = Field(default=10, ge=1)
    rate_limit_register_per_hour: int = Field(default=10, ge=1)
    rate_limit_refresh_per_minute: int = Field(default=30, ge=1)
    rate_limit_uploads_per_hour: int = Field(default=30, ge=1)
    rate_limit_chat_per_minute: int = Field(default=60, ge=1)
    rate_limit_claims_per_hour: int = Field(default=10, ge=1)
    rate_limit_chatbot_per_minute: int = Field(default=20, ge=1)

    jwt_secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "lf_refresh"
    refresh_cookie_path: str = "/api/v1/auth"
    refresh_cookie_secure: bool | None = None
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    cors_origins: list[str] = []

    @property
    def secure_refresh_cookie(self) -> bool:
        if self.refresh_cookie_secure is not None:
            return self.refresh_cookie_secure
        return self.environment == "production"

    storage_dir: Path = Path("storage")
    max_image_size_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 25_000_000
    max_images_per_item: int = 5
    media_url_expire_seconds: int = 900

    ai_text_model: str = "BAAI/bge-small-en-v1.5"
    ai_text_dimensions: int = 384
    ai_image_model: str = "openai/clip-vit-base-patch32"
    ai_image_dimensions: int = 512
    ai_device: Literal["cpu", "cuda", "mps"] = "cpu"
    ai_tasks_enabled: bool = True
    ai_match_candidate_limit: int = 50
    ai_match_min_score: float = 0.70
    ai_match_notify_threshold: float = 0.90
    ai_match_text_weight: float = 0.45
    ai_match_image_weight: float = 0.35
    ai_match_attribute_weight: float = 0.20

    ai_rag_chunk_size: int = 800
    ai_rag_chunk_overlap: int = 120
    ai_rag_candidate_limit: int = 20
    ai_rag_top_k: int = 5
    ai_rag_rrf_k: int = 60
    ai_rag_min_vector_score: float = 0.55
    ai_rag_max_context_chars: int = 6000
    ai_agent_max_steps: int = 4
    ai_agent_tool_timeout_seconds: float = 20.0
    ai_llm_base_url: str | None = None
    ai_llm_api_key: str | None = None
    ai_llm_model: str | None = None
    ai_llm_timeout_seconds: float = 20.0
    ai_llm_max_tokens: int = 600

    def resolved_cache_redis_url(self) -> str:
        if self.redis_cache_url:
            return self.redis_cache_url
        parts = urlsplit(self.redis_url)
        return urlunsplit(
            (parts.scheme, parts.netloc, "/1", parts.query, parts.fragment)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
