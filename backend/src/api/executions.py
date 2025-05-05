from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.engine.planner import CircularDependencyError, EmptyWorkflowError, create_execution_plan
from src.models.execution import WorkflowExecution
from src.schemas.execution import (
    ExecuteWorkflowRequest,
    ExecuteWorkflowResponse,
)
from src.services import execution_service, workflow_service
from src.tasks.execute_workflow import execute_workflow_task

router = APIRouter(tags=["executions"])


@router.post("/api/v1/workflows/{workflow_id}/execute", status_code=202)
async def execute_workflow(
    workflow_id: uuid.UUID,
    payload: ExecuteWorkflowRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if payload is None:
        payload = ExecuteWorkflowRequest()

    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Workflow not found"},
        )

    has_running = await execution_service.check_running_execution(db, workflow_id)
    if has_running:
        raise HTTPException(
            status_code=409,
            detail={"code": "CONFLICT", "message": "Workflow already has a running execution"},
        )

    graph_data = workflow.graph_data
    try:
        plan = create_execution_plan(graph_data)
    except EmptyWorkflowError:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_WORKFLOW", "message": "Workflow has no nodes"},
        )
    except CircularDependencyError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CIRCULAR_DEPENDENCY",
                "message": str(e),
                "details": {"cycle_nodes": e.cycle_nodes},
            },
        )

    budget_max_tokens = None
    budget_max_cost = None
    if payload.budget:
        budget_max_tokens = payload.budget.max_tokens
        budget_max_cost = payload.budget.max_cost

    execution = WorkflowExecution(
        workflow_id=workflow_id,
        status="pending",
        graph_snapshot=graph_data,
        execution_plan=plan.to_dict(),
        budget_max_tokens=budget_max_tokens,
        budget_max_cost=budget_max_cost,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # dispatch celery task
    execute_workflow_task.delay(
        execution_id=str(execution.id),
        plan_dict=plan.to_dict(),
        graph_data=graph_data,
        input_data=payload.input_data,
    )

    ws_url = f"/ws/executions/{execution.id}"

    return {
        "data": ExecuteWorkflowResponse(
            execution_id=execution.id,
            status="pending",
            estimated_cost=None,  # budget estimation is Phase 4
            budget_warnings=[],
            websocket_url=ws_url,
        )
    }


@router.get("/api/v1/executions/{execution_id}")
async def get_execution(
    execution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    detail = await execution_service.get_execution(db, execution_id)
    if not detail:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Execution not found"},
        )
    return {"data": detail}


@router.get("/api/v1/workflows/{workflow_id}/executions")
async def list_executions(
    workflow_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Workflow not found"},
        )

    items, total = await execution_service.list_executions(
        db, workflow_id, skip, limit, status
    )
    return {"data": items, "total": total, "skip": skip, "limit": limit}
