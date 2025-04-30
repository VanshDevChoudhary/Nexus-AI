from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Position(BaseModel):
    x: float
    y: float


class NodeData(BaseModel):
    name: str = ""
    provider: str = ""
    model: str = ""
    system_prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 1000
    max_retries: int = 2
    timeout_seconds: int = 60
    fallback_agent_id: str | None = None

    # tool node fields
    tool_type: str | None = None
    tool_config: dict[str, Any] | None = None

    # conditional node fields
    condition: str | None = None
    branches: dict[str, str] | None = None

    model_config = {"extra": "allow"}


class GraphNode(BaseModel):
    id: str
    type: str
    position: Position
    data: NodeData

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {"agent", "tool", "conditional"}
        if v not in allowed:
            raise ValueError(f"node type must be one of {allowed}")
        return v


class EdgeData(BaseModel):
    condition: str | None = None

    model_config = {"extra": "allow"}


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    data: EdgeData | None = None


class GraphData(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


# --- Request schemas ---

class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    graph_data: GraphData

    @field_validator("graph_data")
    @classmethod
    def validate_graph(cls, v: GraphData) -> GraphData:
        node_ids = {n.id for n in v.nodes}
        for edge in v.edges:
            if edge.source not in node_ids:
                raise ValueError(f"edge references unknown source node: {edge.source}")
            if edge.target not in node_ids:
                raise ValueError(f"edge references unknown target node: {edge.target}")
        return v


class WorkflowUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    graph_data: GraphData | None = None

    @field_validator("graph_data")
    @classmethod
    def validate_graph(cls, v: GraphData | None) -> GraphData | None:
        if v is None:
            return v
        node_ids = {n.id for n in v.nodes}
        for edge in v.edges:
            if edge.source not in node_ids:
                raise ValueError(f"edge references unknown source node: {edge.source}")
            if edge.target not in node_ids:
                raise ValueError(f"edge references unknown target node: {edge.target}")
        return v


# --- Response schemas ---

class WorkflowResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    graph_data: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LastExecution(BaseModel):
    id: uuid.UUID
    status: str
    total_cost: float
    completed_at: datetime | None


class WorkflowListItem(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    node_count: int
    edge_count: int
    created_at: datetime
    updated_at: datetime
    last_execution: LastExecution | None = None

    model_config = {"from_attributes": True}


class WorkflowListResponse(BaseModel):
    data: list[WorkflowListItem]
    total: int
    skip: int
    limit: int


class WorkflowDeleteResponse(BaseModel):
    deleted: bool
    id: uuid.UUID
