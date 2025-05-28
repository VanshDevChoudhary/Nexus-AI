from __future__ import annotations

import asyncio
import json
import logging
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from src.config import settings
from src.db import async_session
from src.models.execution import WorkflowExecution

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/executions/{execution_id}")
async def execution_ws(websocket: WebSocket, execution_id: str) -> None:
    try:
        eid = uuid.UUID(execution_id)
    except ValueError:
        await websocket.close(code=4004, reason="Invalid execution ID")
        return

    async with async_session() as db:
        result = await db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == eid)
        )
        execution = result.scalar_one_or_none()

    if not execution:
        await websocket.accept()
        await websocket.close(code=4004, reason="Execution not found")
        return

    await websocket.accept()

    # already done? send final state and close
    if execution.status in ("completed", "failed"):
        await websocket.send_json({
            "type": "execution_completed",
            "status": execution.status,
            "totals": {
                "tokens_prompt": execution.total_tokens_prompt,
                "tokens_completion": execution.total_tokens_completion,
                "cost": float(execution.total_cost),
                "duration_ms": (
                    int((execution.completed_at - execution.started_at).total_seconds() * 1000)
                    if execution.completed_at and execution.started_at
                    else 0
                ),
                "agents_completed": 0,
                "agents_failed": 0,
                "agents_skipped": 0,
            },
        })
        await websocket.close(code=1000)
        return

    r = aioredis.from_url(settings.redis_url)  # type: ignore[no-untyped-call]
    pubsub = r.pubsub()
    channel = f"execution:{eid}"

    try:
        await pubsub.subscribe(channel)
        logger.info(f"WS subscribed to {channel}")

        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg["type"] == "message":
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")

                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue

                await websocket.send_json(event)

                if event.get("type") == "execution_completed":
                    await websocket.close(code=1000)
                    return

            # small yield to avoid busy loop
            await asyncio.sleep(0.05)

    except WebSocketDisconnect:
        logger.info(f"WS client disconnected from {channel}")
    except Exception as exc:
        logger.error(f"WS error on {channel}: {exc}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await r.aclose()
