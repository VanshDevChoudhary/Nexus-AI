from __future__ import annotations

import time
from typing import Any

from anthropic import AsyncAnthropic
from anthropic.types import TextBlock

from src.adapters.base import BaseLLMAdapter, LLMResponse, TokenUsage, calculate_cost
from src.config import settings

_MODEL_MAP: dict[str, str] = {
    "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-haiku": "claude-3-haiku-20240307",
}


class AnthropicAdapter(BaseLLMAdapter):
    def __init__(self) -> None:
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def complete(
        self,
        prompt: str,
        system_prompt: str,
        config: dict[str, Any],
    ) -> LLMResponse:
        model = config.get("model", "claude-3.5-sonnet")
        api_model = _MODEL_MAP.get(model, model)
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 1000)

        start = time.monotonic()
        response = await self.client.messages.create(
            model=api_model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt if system_prompt else "",
            messages=[{"role": "user", "content": prompt}],
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        prompt_tokens = response.usage.input_tokens
        completion_tokens = response.usage.output_tokens
        text = ""
        if response.content:
            first = response.content[0]
            if isinstance(first, TextBlock):
                text = first.text

        cost = calculate_cost("anthropic", model, prompt_tokens, completion_tokens)

        return LLMResponse(
            text=text,
            tokens=TokenUsage(prompt=prompt_tokens, completion=completion_tokens),
            model=model,
            latency_ms=elapsed_ms,
            cost=cost,
        )
