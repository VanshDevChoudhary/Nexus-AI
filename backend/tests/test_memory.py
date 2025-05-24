from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.memory.store import RecallResult, _embed, recall, store


@pytest.fixture
def fake_embedding():
    return [0.1] * 1536


@pytest.fixture
def mock_openai(fake_embedding):
    mock_resp = MagicMock()
    mock_resp.data = [MagicMock(embedding=fake_embedding)]

    mock_client = AsyncMock()
    mock_client.embeddings.create = AsyncMock(return_value=mock_resp)

    with patch("src.memory.store._get_client", return_value=mock_client):
        yield mock_client


class TestEmbed:
    @pytest.mark.asyncio
    async def test_returns_vector(self, mock_openai, fake_embedding):
        result = await _embed("hello world")
        assert result == fake_embedding
        mock_openai.embeddings.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_correct_model(self, mock_openai):
        await _embed("test")
        call_kwargs = mock_openai.embeddings.create.call_args[1]
        assert call_kwargs["model"] == "text-embedding-3-small"


class TestStore:
    @pytest.mark.asyncio
    async def test_creates_entry(self, mock_openai):
        db = MagicMock()
        db.flush = AsyncMock()

        exec_id = uuid.uuid4()
        await store(db, exec_id, "findings", "some research text")

        db.add.assert_called_once()
        db.flush.assert_called_once()

        added = db.add.call_args[0][0]
        assert added.key == "findings"
        assert added.text == "some research text"
        assert added.execution_id == exec_id
        assert len(added.embedding) == 1536

    @pytest.mark.asyncio
    async def test_with_metadata(self, mock_openai):
        db = MagicMock()
        db.flush = AsyncMock()

        meta = {"agent_node_id": "node-1", "tags": ["research"]}
        await store(db, uuid.uuid4(), "key", "text", metadata=meta)

        added = db.add.call_args[0][0]
        assert added.metadata_ == meta


class TestRecall:
    @pytest.mark.asyncio
    async def test_returns_results(self, mock_openai):
        mock_row = MagicMock()
        mock_row.key = "findings"
        mock_row.text = "Agent A found X"
        mock_row.metadata = {"agent_node_id": "a"}
        mock_row.similarity = 0.92

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row]
        db.execute = AsyncMock(return_value=mock_result)

        results = await recall(db, uuid.uuid4(), "what did agent A find?")

        assert len(results) == 1
        assert isinstance(results[0], RecallResult)
        assert results[0].key == "findings"
        assert results[0].similarity == 0.92

    @pytest.mark.asyncio
    async def test_empty_results(self, mock_openai):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        results = await recall(db, uuid.uuid4(), "nothing here")
        assert results == []

    @pytest.mark.asyncio
    async def test_top_k_parameter(self, mock_openai):
        rows = []
        for i in range(3):
            row = MagicMock()
            row.key = f"key-{i}"
            row.text = f"text-{i}"
            row.metadata = None
            row.similarity = 0.9 - (i * 0.1)
            rows.append(row)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = rows
        db.execute = AsyncMock(return_value=mock_result)

        results = await recall(db, uuid.uuid4(), "query", top_k=3)
        assert len(results) == 3
        assert results[0].similarity > results[-1].similarity


class TestPromptIntegration:
    """Verify _build_agent_prompt handles recalled memories."""

    def test_with_memories(self):
        from src.engine.executor import _build_agent_prompt

        memories = [
            {"key": "research", "text": "Found key insight", "similarity": 0.95},
        ]
        prompt = _build_agent_prompt({}, {}, None, recalled_memories=memories)
        assert "Recalled from memory:" in prompt
        assert "Found key insight" in prompt
        assert "0.95" in prompt

    def test_without_memories(self):
        from src.engine.executor import _build_agent_prompt

        prompt = _build_agent_prompt({}, {}, {"user_query": "hello"})
        assert "Recalled from memory:" not in prompt
        assert "hello" in prompt

    def test_memories_before_deps(self):
        from src.engine.executor import _build_agent_prompt

        memories = [{"key": "k", "text": "mem text", "similarity": 0.8}]
        deps = {"node-1": {"agent_name": "Agent 1", "text": "dep output"}}
        prompt = _build_agent_prompt({}, deps, None, recalled_memories=memories)

        mem_pos = prompt.index("Recalled from memory:")
        dep_pos = prompt.index("Context from previous agents:")
        assert mem_pos < dep_pos
