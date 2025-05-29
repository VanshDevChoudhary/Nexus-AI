from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import redis

from src.config import settings

logger = logging.getLogger(__name__)


def _channel(execution_id: uuid.UUID) -> str:
    return f"execution:{execution_id}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _publish(execution_id: uuid.UUID, event: dict[str, Any]) -> None:
    try:
        r = redis.from_url(settings.redis_url)  # type: ignore[no-untyped-call]
        r.publish(_channel(execution_id), json.dumps(event))
        r.close()
    except Exception as exc:
        logger.warning(f"Failed to publish event: {exc}")


def agent_started(
    execution_id: uuid.UUID,
    agent_id: str,
    agent_name: str,
    parallel_group: int,
) -> None:
    _publish(execution_id, {
        "type": "agent_started",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "parallel_group": parallel_group,
        "timestamp": _now_iso(),
    })


def agent_completed(
    execution_id: uuid.UUID,
    agent_id: str,
    agent_name: str,
    tokens_prompt: int,
    tokens_completion: int,
    cost: float,
    latency_ms: int,
) -> None:
    _publish(execution_id, {
        "type": "agent_completed",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "tokens": {"prompt": tokens_prompt, "completion": tokens_completion},
        "cost": cost,
        "latency_ms": latency_ms,
        "timestamp": _now_iso(),
    })


def agent_failed(
    execution_id: uuid.UUID,
    agent_id: str,
    agent_name: str,
    error: str,
    will_retry: bool,
    retries_remaining: int,
) -> None:
    _publish(execution_id, {
        "type": "agent_failed",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "error": error,
        "will_retry": will_retry,
        "retries_remaining": retries_remaining,
        "timestamp": _now_iso(),
    })


def agent_retrying(
    execution_id: uuid.UUID,
    agent_id: str,
    agent_name: str,
    retry_number: int,
) -> None:
    _publish(execution_id, {
        "type": "agent_retrying",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "retry_number": retry_number,
        "timestamp": _now_iso(),
    })


def agent_fallback(
    execution_id: uuid.UUID,
    original_agent_id: str,
    fallback_agent_id: str,
    fallback_agent_name: str,
    reason: str,
) -> None:
    _publish(execution_id, {
        "type": "agent_fallback",
        "original_agent_id": original_agent_id,
        "fallback_agent_id": fallback_agent_id,
        "fallback_agent_name": fallback_agent_name,
        "reason": reason,
        "timestamp": _now_iso(),
    })


def agent_skipped(
    execution_id: uuid.UUID,
    agent_id: str,
    agent_name: str,
    reason: str,
) -> None:
    _publish(execution_id, {
        "type": "agent_skipped",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "reason": reason,
        "timestamp": _now_iso(),
    })


def budget_warning(
    execution_id: uuid.UUID,
    used_tokens: int,
    used_cost: float,
    max_tokens: int | None,
    max_cost: float | None,
    percentage: int,
) -> None:
    _publish(execution_id, {
        "type": "budget_warning",
        "consumed": {"tokens": used_tokens, "cost": used_cost},
        "budget": {"max_tokens": max_tokens, "max_cost": max_cost},
        "percentage": percentage,
        "timestamp": _now_iso(),
    })


def budget_exceeded(
    execution_id: uuid.UUID,
    used_tokens: int,
    used_cost: float,
    max_tokens: int | None,
    max_cost: float | None,
    agents_not_run: list[str],
) -> None:
    _publish(execution_id, {
        "type": "budget_exceeded",
        "consumed": {"tokens": used_tokens, "cost": used_cost},
        "budget": {"max_tokens": max_tokens, "max_cost": max_cost},
        "agents_not_run": agents_not_run,
        "timestamp": _now_iso(),
    })


def execution_completed(
    execution_id: uuid.UUID,
    status: str,
    tokens_prompt: int,
    tokens_completion: int,
    cost: float,
    duration_ms: int,
    agents_completed: int,
    agents_failed: int,
    agents_skipped: int,
) -> None:
    _publish(execution_id, {
        "type": "execution_completed",
        "status": status,
        "totals": {
            "tokens_prompt": tokens_prompt,
            "tokens_completion": tokens_completion,
            "cost": cost,
            "duration_ms": duration_ms,
            "agents_completed": agents_completed,
            "agents_failed": agents_failed,
            "agents_skipped": agents_skipped,
        },
        "timestamp": _now_iso(),
    })
