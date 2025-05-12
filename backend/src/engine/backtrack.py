from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

# max backoff cap (seconds)
MAX_BACKOFF = 10


@dataclass
class RetryConfig:
    max_retries: int = 2
    base_delay: float = 1.0


@dataclass
class RetryResult:
    success: bool
    result: Any = None
    error: str | None = None
    attempts: int = 0


class RetryHandler:
    """Wraps an async callable with exponential backoff retry logic."""

    def __init__(self, config: RetryConfig | None = None) -> None:
        self.config = config or RetryConfig()

    async def execute(
        self, fn: Callable[..., Awaitable[Any]], *args: Any, **kwargs: Any
    ) -> RetryResult:
        last_error: str = ""
        attempts = 0

        for attempt in range(self.config.max_retries + 1):
            attempts = attempt + 1
            try:
                result = await fn(*args, **kwargs)
                return RetryResult(success=True, result=result, attempts=attempts)
            except Exception as exc:
                last_error = str(exc)
                logger.warning(
                    f"Attempt {attempts}/{self.config.max_retries + 1} failed: {last_error}"
                )
                if attempt < self.config.max_retries:
                    delay = min(self.config.base_delay * (2 ** attempt), MAX_BACKOFF)
                    await asyncio.sleep(delay)

        return RetryResult(success=False, error=last_error, attempts=attempts)


class FallbackHandler:
    """
    If retries are exhausted and the node has a fallback_agent_id,
    execute the fallback agent instead.
    """

    @staticmethod
    def get_fallback_id(node_config: dict[str, Any]) -> str | None:
        return node_config.get("fallback_agent_id")

    @staticmethod
    def should_fallback(node_config: dict[str, Any]) -> bool:
        fid = node_config.get("fallback_agent_id")
        return fid is not None and fid != ""


class DependencyFailureHandler:
    """Propagates failure to downstream nodes in the DAG."""

    @staticmethod
    def find_downstream(
        failed_node: str,
        edges_from: dict[str, list[tuple[str, str | None]]],
    ) -> set[str]:
        """Walk the DAG forward from failed_node, collecting all reachable nodes."""
        skipped: set[str] = set()
        stack = [failed_node]
        while stack:
            current = stack.pop()
            for target, _ in edges_from.get(current, []):
                if target not in skipped:
                    skipped.add(target)
                    stack.append(target)
        return skipped

    @staticmethod
    def propagate(
        failed_node: str,
        edges_from: dict[str, list[tuple[str, str | None]]],
        skipped_nodes: set[str],
    ) -> None:
        """Mark all downstream nodes as skipped in-place."""
        new_skips = DependencyFailureHandler.find_downstream(failed_node, edges_from)
        skipped_nodes.update(new_skips)
