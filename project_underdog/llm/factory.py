"""LLM provider factory - creates the right provider based on configuration."""

from __future__ import annotations

import logging

from project_underdog.config import get_settings
from project_underdog.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

_provider_cache: BaseLLMProvider | None = None


def get_llm_provider() -> BaseLLMProvider:
    global _provider_cache

    if _provider_cache is not None:
        return _provider_cache

    settings = get_settings()
    provider_name = settings.llm_provider

    if provider_name == "openai":
        from project_underdog.llm.openai_provider import OpenAIProvider
        _provider_cache = OpenAIProvider(
            api_key=settings.llm_api_key.get_secret_value(),
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
        )
    elif provider_name == "anthropic":
        from project_underdog.llm.anthropic_provider import AnthropicProvider
        _provider_cache = AnthropicProvider(
            api_key=settings.llm_api_key.get_secret_value(),
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
        )
    else:
        from project_underdog.llm.simulation import SimulationProvider
        _provider_cache = SimulationProvider()

    logger.info("LLM provider initialized: %s", _provider_cache.provider_name)
    return _provider_cache


def reset_llm_provider() -> None:
    global _provider_cache
    _provider_cache = None
