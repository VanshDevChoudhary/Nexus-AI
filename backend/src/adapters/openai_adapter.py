from __future__ import annotations

import time
from typing import Any

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from src.adapters.base import BaseLLMAdapter, LLMResponse, TokenUsage, calculate_cost
from src.config import settings


class OpenAIAdapter(BaseLLMAdapter):
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def complete(
        self,
        prompt: str,
        system_prompt: str,
        config: dict[str, Any],
    ) -> LLMResponse:
        model = config.get("model", "gpt-4o")
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 1000)

        messages: list[ChatCompletionMessageParam] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        start = time.monotonic()
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        text = response.choices[0].message.content or ""

        cost = calculate_cost("openai", model, prompt_tokens, completion_tokens)

        return LLMResponse(
            text=text,
            tokens=TokenUsage(prompt=prompt_tokens, completion=completion_tokens),
            model=model,
            latency_ms=elapsed_ms,
            cost=cost,
        )
