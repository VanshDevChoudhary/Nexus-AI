from __future__ import annotations

from src.adapters.base import LLMResponse, TokenUsage
from src.engine.backtrack import (
    DependencyFailureHandler,
    FallbackHandler,
    RetryConfig,
    RetryHandler,
)


def _ok_response(text: str = "done") -> LLMResponse:
    return LLMResponse(
        text=text,
        tokens=TokenUsage(prompt=10, completion=5),
        model="gpt-4o",
        latency_ms=100,
        cost=0.001,
    )


class TestRetryHandler:
    async def test_succeeds_first_try(self):
        async def good_fn():
            return _ok_response()

        handler = RetryHandler(RetryConfig(max_retries=2, base_delay=0))
        result = await handler.execute(good_fn)
        assert result.success
        assert result.attempts == 1

    async def test_succeeds_on_second_attempt(self):
        call_count = 0

        async def flaky_fn():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise RuntimeError("temporary failure")
            return _ok_response("recovered")

        handler = RetryHandler(RetryConfig(max_retries=2, base_delay=0))
        result = await handler.execute(flaky_fn)
        assert result.success
        assert result.attempts == 2
        assert result.result.text == "recovered"

    async def test_exhausts_retries(self):
        async def always_fail():
            raise RuntimeError("permanent error")

        handler = RetryHandler(RetryConfig(max_retries=1, base_delay=0))
        result = await handler.execute(always_fail)
        assert not result.success
        assert result.attempts == 2  # initial + 1 retry
        assert "permanent error" in result.error

    async def test_zero_retries(self):
        async def fail_once():
            raise ValueError("boom")

        handler = RetryHandler(RetryConfig(max_retries=0, base_delay=0))
        result = await handler.execute(fail_once)
        assert not result.success
        assert result.attempts == 1


class TestFallbackHandler:
    def test_fallback_configured(self):
        cfg = {"name": "agent-a", "fallback_agent_id": "agent-b"}
        assert FallbackHandler.should_fallback(cfg)
        assert FallbackHandler.get_fallback_id(cfg) == "agent-b"

    def test_no_fallback(self):
        cfg = {"name": "agent-a"}
        assert not FallbackHandler.should_fallback(cfg)
        assert FallbackHandler.get_fallback_id(cfg) is None

    def test_empty_fallback_id(self):
        cfg = {"name": "agent-a", "fallback_agent_id": ""}
        assert not FallbackHandler.should_fallback(cfg)


class TestDependencyFailureHandler:
    def test_skip_on_failure(self):
        """A fails -> B and C (depend on A) get skipped."""
        edges_from: dict[str, list[tuple[str, str | None]]] = {
            "a": [("b", None), ("c", None)],
        }
        skipped: set[str] = set()
        DependencyFailureHandler.propagate("a", edges_from, skipped)
        assert skipped == {"b", "c"}

    def test_cascading_failure(self):
        """A fails -> B skipped -> D skipped. C is independent."""
        edges_from: dict[str, list[tuple[str, str | None]]] = {
            "a": [("b", None)],
            "b": [("d", None)],
            "c": [("d", None)],
        }
        skipped: set[str] = set()
        DependencyFailureHandler.propagate("a", edges_from, skipped)
        assert "b" in skipped
        assert "d" in skipped
        assert "c" not in skipped

    def test_optional_branch_continues(self):
        """Failure on a branch without downstream doesn't affect anything."""
        edges_from: dict[str, list[tuple[str, str | None]]] = {
            "a": [("b", None), ("c", None)],
        }
        skipped: set[str] = set()
        # "b" fails but has no downstream
        DependencyFailureHandler.propagate("b", edges_from, skipped)
        assert len(skipped) == 0  # b has no outgoing edges

    def test_no_double_skip(self):
        edges_from: dict[str, list[tuple[str, str | None]]] = {
            "a": [("b", None)],
            "b": [("c", None)],
        }
        skipped: set[str] = set()
        DependencyFailureHandler.propagate("a", edges_from, skipped)
        DependencyFailureHandler.propagate("a", edges_from, skipped)
        assert skipped == {"b", "c"}

    def test_find_downstream(self):
        edges_from: dict[str, list[tuple[str, str | None]]] = {
            "root": [("mid", None)],
            "mid": [("leaf1", None), ("leaf2", None)],
        }
        downstream = DependencyFailureHandler.find_downstream("root", edges_from)
        assert downstream == {"mid", "leaf1", "leaf2"}
