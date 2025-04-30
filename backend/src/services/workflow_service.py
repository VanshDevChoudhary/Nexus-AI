from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.workflow import Workflow
from src.schemas.workflow import (
    LastExecution,
    WorkflowCreate,
    WorkflowListItem,
    WorkflowUpdate,
)


async def create_workflow(db: AsyncSession, payload: WorkflowCreate) -> Workflow:
    workflow = Workflow(
        name=payload.name,
        description=payload.description,
        graph_data=payload.graph_data.model_dump(),
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return workflow


async def get_workflow(db: AsyncSession, workflow_id: uuid.UUID) -> Workflow | None:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    return result.scalar_one_or_none()


async def update_workflow(
    db: AsyncSession,
    workflow_id: uuid.UUID,
    payload: WorkflowUpdate,
) -> Workflow | None:
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        return None

    update_data = payload.model_dump(exclude_unset=True)
    if "graph_data" in update_data and update_data["graph_data"] is not None:
        update_data["graph_data"] = payload.graph_data.model_dump()  # type: ignore[union-attr]

    for field, value in update_data.items():
        setattr(workflow, field, value)

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)
    return workflow


async def delete_workflow(db: AsyncSession, workflow_id: uuid.UUID) -> bool:
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        return False
    await db.delete(workflow)
    await db.commit()
    return True


async def list_workflows(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    sort: str = "created_at",
    order: str = "desc",
) -> tuple[list[WorkflowListItem], int]:
    # count
    count_q = select(func.count()).select_from(Workflow)
    total = (await db.execute(count_q)).scalar_one()

    sort_col = getattr(Workflow, sort, Workflow.created_at)
    order_col = sort_col.desc() if order == "desc" else sort_col.asc()

    q = (
        select(Workflow)
        .options(selectinload(Workflow.executions))
        .order_by(order_col)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(q)
    workflows = result.scalars().all()

    items: list[WorkflowListItem] = []
    for w in workflows:
        graph = w.graph_data or {}
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        last_exec = _get_last_execution(w.executions)

        items.append(
            WorkflowListItem(
                id=w.id,
                name=w.name,
                description=w.description,
                node_count=len(nodes),
                edge_count=len(edges),
                created_at=w.created_at,
                updated_at=w.updated_at,
                last_execution=last_exec,
            )
        )

    return items, total


def _get_last_execution(
    executions: list[Any],
) -> LastExecution | None:
    if not executions:
        return None

    latest = max(executions, key=lambda e: e.created_at)
    return LastExecution(
        id=latest.id,
        status=latest.status,
        total_cost=latest.total_cost,
        completed_at=latest.completed_at,
    )
