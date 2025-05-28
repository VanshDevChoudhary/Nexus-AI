"""Tests for WebSocket streaming and event publishing."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

from src.engine import events


class TestEventPublisher:
    """Event publisher sends correct JSON to Redis."""

    @patch("src.engine.events.redis")
    def test_agent_started(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_started(eid, "node_1", "Summarizer", 0)

        mock_conn.publish.assert_called_once()
        channel, data = mock_conn.publish.call_args[0]
        assert channel == f"execution:{eid}"
        parsed = json.loads(data)
        assert parsed["type"] == "agent_started"
        assert parsed["agent_id"] == "node_1"
        assert parsed["agent_name"] == "Summarizer"
        assert parsed["parallel_group"] == 0
        assert "timestamp" in parsed

    @patch("src.engine.events.redis")
    def test_agent_completed(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_completed(eid, "node_1", "Summarizer", 5000, 1200, 0.02, 3200)

        channel, data = mock_conn.publish.call_args[0]
        parsed = json.loads(data)
        assert parsed["type"] == "agent_completed"
        assert parsed["tokens"] == {"prompt": 5000, "completion": 1200}
        assert parsed["cost"] == 0.02
        assert parsed["latency_ms"] == 3200

    @patch("src.engine.events.redis")
    def test_agent_failed(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_failed(eid, "node_2", "Analyzer", "Timeout", True, 1)

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "agent_failed"
        assert parsed["will_retry"] is True
        assert parsed["retries_remaining"] == 1
        assert parsed["error"] == "Timeout"

    @patch("src.engine.events.redis")
    def test_agent_retrying(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_retrying(eid, "node_2", "Analyzer", 1)

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "agent_retrying"
        assert parsed["retry_number"] == 1

    @patch("src.engine.events.redis")
    def test_agent_fallback(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_fallback(eid, "node_2", "node_5", "Backup", "Max retries exhausted")

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "agent_fallback"
        assert parsed["original_agent_id"] == "node_2"
        assert parsed["fallback_agent_id"] == "node_5"

    @patch("src.engine.events.redis")
    def test_agent_skipped(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.agent_skipped(eid, "node_3", "Reporter", "Dependency failed")

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "agent_skipped"
        assert parsed["reason"] == "Dependency failed"

    @patch("src.engine.events.redis")
    def test_budget_warning(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.budget_warning(eid, 42000, 0.41, 50000, 0.50, 82)

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "budget_warning"
        assert parsed["consumed"]["tokens"] == 42000
        assert parsed["percentage"] == 82

    @patch("src.engine.events.redis")
    def test_budget_exceeded(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.budget_exceeded(eid, 51200, 0.52, 50000, 0.50, ["node_4"])

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "budget_exceeded"
        assert parsed["agents_not_run"] == ["node_4"]

    @patch("src.engine.events.redis")
    def test_execution_completed(self, mock_redis: MagicMock) -> None:
        mock_conn = MagicMock()
        mock_redis.from_url.return_value = mock_conn

        eid = uuid.uuid4()
        events.execution_completed(eid, "completed", 12340, 3200, 0.045, 18500, 4, 0, 0)

        parsed = json.loads(mock_conn.publish.call_args[0][1])
        assert parsed["type"] == "execution_completed"
        assert parsed["status"] == "completed"
        assert parsed["totals"]["cost"] == 0.045
        assert parsed["totals"]["agents_completed"] == 4

    @patch("src.engine.events.redis")
    def test_publish_failure_swallowed(self, mock_redis: MagicMock) -> None:
        """Redis failures shouldn't crash the executor."""
        mock_redis.from_url.side_effect = ConnectionError("Redis down")
        eid = uuid.uuid4()
        # should not raise
        events.agent_started(eid, "node_1", "Test", 0)


class TestRetryCallback:
    """RetryHandler calls on_attempt_fail correctly."""

    @pytest.mark.asyncio
    async def test_callback_on_failure(self) -> None:
        from src.engine.backtrack import RetryConfig, RetryHandler

        attempts_seen: list[tuple[int, str, int]] = []

        def on_fail(attempt: int, error: str, remaining: int) -> None:
            attempts_seen.append((attempt, error, remaining))

        async def always_fail() -> None:
            raise RuntimeError("boom")

        handler = RetryHandler(RetryConfig(max_retries=2, base_delay=0.01))
        result = await handler.execute(always_fail, on_attempt_fail=on_fail)

        assert not result.success
        assert len(attempts_seen) == 3
        # first attempt: 2 remaining
        assert attempts_seen[0] == (1, "boom", 2)
        # second attempt: 1 remaining
        assert attempts_seen[1] == (2, "boom", 1)
        # third attempt: 0 remaining
        assert attempts_seen[2] == (3, "boom", 0)

    @pytest.mark.asyncio
    async def test_no_callback_on_success(self) -> None:
        from src.engine.backtrack import RetryConfig, RetryHandler

        called = False

        def on_fail(attempt: int, error: str, remaining: int) -> None:
            nonlocal called
            called = True

        async def succeeds() -> str:
            return "ok"

        handler = RetryHandler(RetryConfig(max_retries=2))
        result = await handler.execute(succeeds, on_attempt_fail=on_fail)

        assert result.success
        assert not called
