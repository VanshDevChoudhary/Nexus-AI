from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# --- Request schemas ---

class BudgetConfig(BaseModel):
    max_tokens: int | None = None
    max_cost: float | None = None


class ExecuteWorkflowRequest(BaseModel):
    input_data: dict[str, Any] | None = None
    budget: BudgetConfig | None = None


# --- Response schemas ---

class ExecuteWorkflowResponse(BaseModel):
    execution_id: uuid.UUID
    status: str
    estimated_cost: float | None = None
    budget_warnings: list[str] = Field(default_factory=list)
    websocket_url: str


class ExecutionTotals(BaseModel):
    tokens_prompt: int
    tokens_completion: int
    tokens_total: int
    cost: float
    duration_ms: int | None


class ExecutionBudget(BaseModel):
    max_tokens: int | None
    max_cost: float | None


class AgentExecutionResponse(BaseModel):
    id: uuid.UUID
    agent_node_id: str
    agent_name: str
    status: str
    provider: str
    model_used: str
    tokens_prompt: int
    tokens_completion: int
    cost: float
    latency_ms: int | None
    retries: int
    is_fallback: bool
    execution_order: int
    parallel_group: int
    input_data: dict[str, Any] | None
    output_data: dict[str, Any] | None
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ExecutionDetailResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    workflow_name: str
    status: str
    budget: ExecutionBudget | None
    totals: ExecutionTotals
    estimated_cost: float | None
    execution_plan: dict[str, Any] | None
    agents: list[AgentExecutionResponse]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class ExecutionListItem(BaseModel):
    id: uuid.UUID
    status: str
    total_cost: float
    total_tokens: int
    agent_count: int
    duration_ms: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class ExecutionListResponse(BaseModel):
    data: list[ExecutionListItem]
    total: int
    skip: int
    limit: int
