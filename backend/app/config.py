"""Environment fallback configuration for CodeLens Tutor."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=[str(ROOT_ENV), str(BACKEND_ENV)],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    codelens_provider_mode: str = "local"

    # Local Network AI (OpenAI-compatible)
    codelens_local_base_url: str = "http://localhost:11434/v1"
    codelens_local_api_key: str = "EMPTY"
    codelens_local_text_model: str = "qwen2.5-coder:32b"
    codelens_local_vision_model: str = "qwen2.5vl:32b"

    # OpenRouter
    codelens_openrouter_api_key: str = ""
    codelens_openrouter_text_model: str = "qwen/qwen-2.5-coder-32b-instruct"
    codelens_openrouter_vision_model: str = "qwen/qwen2.5-vl-72b-instruct"

    # CORS / Security
    codelens_allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # Limits
    llm_max_tokens: int = 32768
    llm_timeout_seconds: float = 600.0
    repo_session_ttl_seconds: int = 1800


settings = Settings()
