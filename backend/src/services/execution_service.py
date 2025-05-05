from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.execution import WorkflowExecution
from src.schemas.execution import (
    AgentExecutionResponse,
    ExecutionBudget,
    ExecutionDetailResponse,
    ExecutionListItem,
    ExecutionTotals,
)


async def get_execution(
    db: AsyncSession, execution_id: uuid.UUID
) -> ExecutionDetailResponse | None:
    q = (
        select(WorkflowExecution)
        .options(
            selectinload(WorkflowExecution.agent_executions),
            selectinload(WorkflowExecution.workflow),
        )
        .where(WorkflowExecution.id == execution_id)
    )
    result = await db.execute(q)
    ex = result.scalar_one_or_none()
    if not ex:
        return None

    duration = None
    if ex.started_at and ex.completed_at:
        duration = int((ex.completed_at - ex.started_at).total_seconds() * 1000)

    budget = None
    if ex.budget_max_tokens is not None or ex.budget_max_cost is not None:
        budget = ExecutionBudget(
            max_tokens=ex.budget_max_tokens,
            max_cost=ex.budget_max_cost,
        )

    agents = sorted(ex.agent_executions, key=lambda a: a.execution_order)

    return ExecutionDetailResponse(
        id=ex.id,
        workflow_id=ex.workflow_id,
        workflow_name=ex.workflow.name if ex.workflow else "Unknown",
        status=ex.status,
        budget=budget,
        totals=ExecutionTotals(
            tokens_prompt=ex.total_tokens_prompt,
            tokens_completion=ex.total_tokens_completion,
            tokens_total=ex.total_tokens_prompt + ex.total_tokens_completion,
            cost=ex.total_cost,
            duration_ms=duration,
        ),
        estimated_cost=ex.estimated_cost,
        execution_plan=ex.execution_plan,
        agents=[AgentExecutionResponse.model_validate(a) for a in agents],
        started_at=ex.started_at,
        completed_at=ex.completed_at,
        created_at=ex.created_at,
    )


async def list_executions(
    db: AsyncSession,
    workflow_id: uuid.UUID,
    skip: int = 0,
    limit: int = 20,
    status: str | None = None,
) -> tuple[list[ExecutionListItem], int]:
    base = select(WorkflowExecution).where(WorkflowExecution.workflow_id == workflow_id)
    if status:
        base = base.where(WorkflowExecution.status == status)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    q = (
        base.options(selectinload(WorkflowExecution.agent_executions))
        .order_by(WorkflowExecution.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(q)
    executions = result.scalars().all()

    items = []
    for ex in executions:
        duration = None
        if ex.started_at and ex.completed_at:
            duration = int((ex.completed_at - ex.started_at).total_seconds() * 1000)

        items.append(
            ExecutionListItem(
                id=ex.id,
                status=ex.status,
                total_cost=ex.total_cost,
                total_tokens=ex.total_tokens_prompt + ex.total_tokens_completion,
                agent_count=len(ex.agent_executions),
                duration_ms=duration,
                started_at=ex.started_at,
                completed_at=ex.completed_at,
                created_at=ex.created_at,
            )
        )

    return items, total


async def check_running_execution(db: AsyncSession, workflow_id: uuid.UUID) -> bool:
    """Return True if workflow already has a running execution."""
    q = select(WorkflowExecution).where(
        WorkflowExecution.workflow_id == workflow_id,
        WorkflowExecution.status.in_(["pending", "running"]),
    )
    result = await db.execute(q)
    return result.scalar_one_or_none() is not None
