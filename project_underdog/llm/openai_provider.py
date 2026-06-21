"""OpenAI-compatible LLM provider (OpenAI, Groq, DeepSeek, local vLLM etc.)."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx


from project_underdog.llm.base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: str = "https://api.openai.com/v1",
        max_tokens: int = 1024,
        temperature: float = 0.3,
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return f"openai:{self.model}"

    async def generate(self, prompt: str, system: str = "", **kwargs: Any) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(
                answer="",
                model=self.model,
                provider=self.provider_name,
                error="No API key configured. Set UNDERDOG_LLM_API_KEY in .env",
            )

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "temperature": kwargs.get("temperature", self.temperature),
        }

        start = time.monotonic()
        retries = 2
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "http://localhost:8800",
                            "X-Title": "Project Underdog",
                        },
                        json=payload,
                    )
                    data = response.json()

                    if response.status_code == 429 and attempt < retries:
                        wait = (attempt + 1) * 3
                        logger.warning("Rate limited, retrying in %ds...", wait)
                        await asyncio.sleep(wait)
                        continue

                    if response.status_code != 200:
                        error_msg = data.get("error", {}).get("message", str(data))
                        logger.error("API error: %s", error_msg)
                        return LLMResponse(
                            answer="",
                            model=self.model,
                            provider=self.provider_name,
                            error=error_msg,
                        )

                    choice = data["choices"][0]
                    content = choice["message"]["content"]
                    usage = data.get("usage", {})

                    return LLMResponse(
                        answer=content,
                        model=self.model,
                        provider=self.provider_name,
                        tokens_used=usage.get("total_tokens", 0),
                        input_tokens=usage.get("prompt_tokens", 0),
                        output_tokens=usage.get("completion_tokens", 0),
                        latency_ms=(time.monotonic() - start) * 1000,
                        raw_response=data,
                    )
            except httpx.TimeoutException:
                if attempt < retries:
                    await asyncio.sleep((attempt + 1) * 3)
                    continue
                logger.error("API timeout after %.0fs", self.timeout)
                return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                                 error="Request timed out")
            except Exception as e:
                if attempt < retries:
                    await asyncio.sleep((attempt + 1) * 3)
                    continue
                logger.error("API call failed: %s", e)
                return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                                 error=str(e))

        return LLMResponse(answer="", model=self.model, provider=self.provider_name,
                         error="Max retries exceeded")

    async def health_check(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False
