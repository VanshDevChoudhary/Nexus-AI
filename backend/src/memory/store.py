from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.memory import MemoryEntry

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def _embed(text_input: str) -> list[float]:
    client = _get_client()
    resp = await client.embeddings.create(
        model=settings.embedding_model,
        input=text_input,
    )
    return resp.data[0].embedding


@dataclass
class RecallResult:
    key: str
    text: str
    metadata: dict[str, Any] | None
    similarity: float


async def store(
    db: AsyncSession,
    execution_id: uuid.UUID,
    key: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> uuid.UUID:
    """Embed and store a memory entry scoped to an execution."""
    embedding = await _embed(content)

    entry = MemoryEntry(
        execution_id=execution_id,
        key=key,
        text=content,
        embedding=embedding,
        metadata_=metadata,
    )
    db.add(entry)
    await db.flush()

    logger.info(f"Stored memory '{key}' for execution {execution_id}")
    return entry.id


async def recall(
    db: AsyncSession,
    execution_id: uuid.UUID,
    query: str,
    top_k: int = 5,
) -> list[RecallResult]:
    """Semantic search over memories within an execution."""
    query_embedding = await _embed(query)

    # pgvector cosine distance: 1 - cosine_similarity
    stmt = (
        select(
            MemoryEntry.key,
            MemoryEntry.text,
            MemoryEntry.metadata_.label("metadata"),
            (1 - MemoryEntry.embedding.cosine_distance(query_embedding)).label("similarity"),
        )
        .where(MemoryEntry.execution_id == execution_id)
        .order_by(text("similarity DESC"))
        .limit(top_k)
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        RecallResult(
            key=row.key,
            text=row.text,
            metadata=row.metadata,
            similarity=float(row.similarity),
        )
        for row in rows
    ]
