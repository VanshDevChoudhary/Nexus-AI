from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class TokenUsage:
    prompt: int
    completion: int


@dataclass
class LLMResponse:
    text: str
    tokens: TokenUsage
    model: str
    latency_ms: int
    cost: float


# load pricing once at import — check both repo root and app root (Docker)
_base = Path(__file__).resolve().parents[2]
_candidates = [
    _base / "pricing" / "models.json",
    _base.parent / "pricing" / "models.json",
]
_pricing_data: dict[str, Any] = {}

for _p in _candidates:
    if _p.exists():
        with open(_p) as _f:
            _pricing_data = json.load(_f)
        break


def get_model_pricing(provider: str, model: str) -> dict[str, float]:
    default: dict[str, float] = {"input_per_1k": 0.0, "output_per_1k": 0.0}
    provider_models: dict[str, Any] = _pricing_data.get(provider, {})
    result: dict[str, float] = provider_models.get(model, default)
    return result


def calculate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = get_model_pricing(provider, model)
    input_cost = (prompt_tokens / 1000) * pricing["input_per_1k"]
    output_cost = (completion_tokens / 1000) * pricing["output_per_1k"]
    return round(input_cost + output_cost, 6)


class BaseLLMAdapter(ABC):
    @abstractmethod
    async def complete(
        self,
        prompt: str,
        system_prompt: str,
        config: dict[str, Any],
    ) -> LLMResponse:
        ...
