"""Project Underdog - Centralized configuration via Pydantic Settings."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="UNDERDOG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Networking ---
    host: str = "0.0.0.0"
    port: int = 8801
    url: str = ""

    # --- Task pipeline ---
    min_workers: int = 3
    consensus_threshold: float = 0.5
    task_timeout: int = 300
    heartbeat: int = 15

    # --- Database ---
    db_url: str = "sqlite+aiosqlite:///data/underdog.db"

    # --- LLM / API ---
    llm_provider: Literal["openai", "anthropic", "local", "none"] = "none"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: SecretStr = Field(default=SecretStr(""))
    llm_base_url: str = "https://api.openai.com/v1"
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.3

    # --- Reputation ---
    reputation_base: float = 1.0
    reputation_success_gain: float = 0.05
    reputation_failure_loss: float = 0.15
    reputation_honeypot_loss: float = 0.30
    reputation_min_threshold: float = 0.2

    # --- Logging ---
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_format: Literal["text", "json"] = "text"
    debug: bool = False

    # --- Paths ---
    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parent.parent

    @property
    def data_dir(self) -> Path:
        d = self.project_root / "data"
        d.mkdir(exist_ok=True, parents=True)
        return d

    @property
    def export_dir(self) -> Path:
        d = self.data_dir / "exports"
        d.mkdir(exist_ok=True, parents=True)
        return d

    @property
    def model_dir(self) -> Path:
        d = self.data_dir / "models"
        d.mkdir(exist_ok=True, parents=True)
        return d

    @property
    def orchestrator_url(self) -> str:
        return self.url or f"ws://{self.host}:{self.port}/ws"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None


# Convenience singleton – prefer get_settings() in new code
settings = get_settings()


# Legacy compatibility aliases (for existing imports)
ORCHESTRATOR_HOST = settings.host
ORCHESTRATOR_PORT = settings.port
ORCHESTRATOR_URL = settings.orchestrator_url

MIN_WORKERS_PER_TASK = settings.min_workers
CONSENSUS_THRESHOLD = settings.consensus_threshold
TASK_TIMEOUT_SEC = settings.task_timeout
HEARTBEAT_INTERVAL_SEC = settings.heartbeat

REPUTATION_BASE = settings.reputation_base
REPUTATION_SUCCESS_GAIN = settings.reputation_success_gain
REPUTATION_FAILURE_LOSS = settings.reputation_failure_loss
REPUTATION_HONEYPOT_LOSS = settings.reputation_honeypot_loss
REPUTATION_MIN_THRESHOLD = settings.reputation_min_threshold

DATA_DIR = settings.data_dir
PROJECT_ROOT = settings.project_root
