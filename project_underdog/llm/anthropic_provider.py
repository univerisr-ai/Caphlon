"""Anthropic (Claude) LLM provider."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from project_underdog.llm.base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "claude-3-haiku-20240307",
        max_tokens: int = 1024,
        temperature: float = 0.3,
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return f"anthropic:{self.model}"

    async def generate(self, prompt: str, system: str = "", **kwargs: Any) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(
                answer="",
                model=self.model,
                provider=self.provider_name,
                error="No API key configured. Set UNDERDOG_LLM_API_KEY in .env",
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "temperature": kwargs.get("temperature", self.temperature),
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                data = response.json()

                if response.status_code != 200:
                    error_msg = data.get("error", {}).get("message", str(data))
                    return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                                     error=error_msg)

                content = data["content"][0]["text"]
                usage = data.get("usage", {})

                return LLMResponse(
                    answer=content,
                    model=self.model,
                    provider=self.provider_name,
                    tokens_used=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                    input_tokens=usage.get("input_tokens", 0),
                    output_tokens=usage.get("output_tokens", 0),
                    latency_ms=(time.monotonic() - start) * 1000,
                    raw_response=data,
                )
        except httpx.TimeoutException:
            return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                             error="Request timed out")
        except Exception as e:
            logger.error("Anthropic API call failed: %s", e)
            return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                             error=str(e))

    async def health_check(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.get(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": self.api_key},
                )
                return True
        except Exception:
            return False
