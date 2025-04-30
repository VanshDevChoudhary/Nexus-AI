from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_db
from src.schemas.workflow import (
    WorkflowCreate,
    WorkflowDeleteResponse,
    WorkflowResponse,
    WorkflowUpdate,
)
from src.services import workflow_service

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.get("")
async def list_workflows(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    items, total = await workflow_service.list_workflows(db, skip, limit, sort, order)
    return {"data": items, "total": total, "skip": skip, "limit": limit}


@router.post("", status_code=201)
async def create_workflow(
    payload: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    workflow = await workflow_service.create_workflow(db, payload)
    return {"data": WorkflowResponse.model_validate(workflow)}


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Workflow not found"},
        )
    return {"data": WorkflowResponse.model_validate(workflow)}


@router.put("/{workflow_id}")
async def update_workflow(
    workflow_id: uuid.UUID,
    payload: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    workflow = await workflow_service.update_workflow(db, workflow_id, payload)
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Workflow not found"},
        )
    return {"data": WorkflowResponse.model_validate(workflow)}


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    deleted = await workflow_service.delete_workflow(db, workflow_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Workflow not found"},
        )
    return {"data": WorkflowDeleteResponse(deleted=True, id=workflow_id)}
