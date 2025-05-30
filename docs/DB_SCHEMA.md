# Database Schema

## Project: nexus-ai
## Database: PostgreSQL 16 + pgvector
## ORM: SQLAlchemy 2.0 (async) + Alembic
## Date: 2025-04-20

---

## Entity Relationship Overview
```
┌──────────────┐       ┌─────────────────────┐       ┌───────────────────┐
│   Workflow    │ 1───N │ WorkflowExecution    │ 1───N │ AgentExecution    │
│              │       │                     │       │                   │
│ id           │       │ id                  │       │ id                │
│ name         │       │ workflow_id (FK)     │       │ execution_id (FK) │
│ description  │       │ status              │       │ agent_node_id     │
│ graph_data   │       │ budget_max_tokens   │       │ status            │
│ created_at   │       │ budget_max_cost     │       │ input_data        │
│ updated_at   │       │ total_tokens        │       │ output_data       │
└──────────────┘       │ total_cost          │       │ tokens_prompt     │
                       │ started_at          │       │ tokens_completion │
                       │ completed_at        │       │ cost              │
                       └─────────┬───────────┘       │ retries           │
                                 │                   │ model_used        │
                                 │ 1───N             │ latency_ms        │
                                 │                   │ error_message     │
                       ┌─────────┴───────────┐       │ started_at        │
                       │   MemoryEntry       │       │ completed_at      │
                       │                     │       └───────────────────┘
                       │ id                  │
                       │ execution_id (FK)   │
                       │ key                 │
                       │ text                │
                       │ embedding (vector)  │
                       │ metadata            │
                       │ created_at          │
                       └─────────────────────┘
```

---

## Models

### Workflow
**Purpose:** Stores workflow definitions — the graph of nodes and edges.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, default uuid4 | |
| name | String(255) | Not null | User-given workflow name |
| description | Text | Nullable | Optional description |
| graph_data | JSONB | Not null, default {} | ReactFlow nodes + edges + node configs |
| created_at | DateTime(tz) | Not null, default now() | |
| updated_at | DateTime(tz) | Not null, auto-update | |

**Relationships:**
- Has many WorkflowExecution (cascade delete)

**Indexes:**
- `created_at` — for listing workflows in order

**Notes on `graph_data`:**
The JSONB column stores the complete ReactFlow graph. Structure:
```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "agent | tool | conditional",
      "position": { "x": 100, "y": 200 },
      "data": {
        "name": "Summarizer",
        "provider": "openai",
        "model": "gpt-4o",
        "system_prompt": "You are a summarizer...",
        "temperature": 0.7,
        "max_tokens": 1000,
        "max_retries": 2,
        "timeout_seconds": 60,
        "fallback_agent_id": "node_3" 
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "data": {
        "condition": null
      }
    }
  ]
}
```

---

### WorkflowExecution
**Purpose:** Tracks a single run of a workflow.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, default uuid4 | |
| workflow_id | UUID | FK → workflows.id, Not null | |
| status | String(20) | Not null, default 'pending' | pending, running, completed, failed, budget_exceeded, cancelled |
| graph_snapshot | JSONB | Not null | Frozen copy of graph_data at execution time |
| budget_max_tokens | Integer | Nullable | Max tokens allowed (null = unlimited) |
| budget_max_cost | Float | Nullable | Max cost in USD (null = unlimited) |
| total_tokens_prompt | Integer | Not null, default 0 | Running total |
| total_tokens_completion | Integer | Not null, default 0 | Running total |
| total_cost | Float | Not null, default 0.0 | Running total in USD |
| estimated_cost | Float | Nullable | Pre-execution estimate from budget planner |
| execution_plan | JSONB | Nullable | The resolved execution plan (parallel groups, order) |
| error_message | Text | Nullable | Top-level error if execution failed |
| started_at | DateTime(tz) | Nullable | When execution actually began |
| completed_at | DateTime(tz) | Nullable | When execution finished |
| created_at | DateTime(tz) | Not null, default now() | When the execution record was created |

**Relationships:**
- Belongs to Workflow
- Has many AgentExecution (cascade delete)
- Has many MemoryEntry (cascade delete)

**Indexes:**
- `workflow_id` — for listing executions per workflow
- `status` — for filtering by status
- `created_at` — for ordering

---

### AgentExecution
**Purpose:** Tracks the execution of a single agent within a workflow execution.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, default uuid4 | |
| execution_id | UUID | FK → workflow_executions.id, Not null | |
| agent_node_id | String(100) | Not null | Matches node id in graph_data |
| agent_name | String(255) | Not null | Copied from node data for easy display |
| status | String(20) | Not null, default 'pending' | pending, running, completed, failed, skipped, retrying |
| input_data | JSONB | Nullable | What was passed to this agent |
| output_data | JSONB | Nullable | What the agent produced |
| error_message | Text | Nullable | Error detail if failed |
| provider | String(50) | Not null | openai, anthropic |
| model_used | String(100) | Not null | Actual model string used |
| tokens_prompt | Integer | Not null, default 0 | |
| tokens_completion | Integer | Not null, default 0 | |
| cost | Float | Not null, default 0.0 | Calculated from model pricing |
| latency_ms | Integer | Nullable | Time from send to receive |
| retries | Integer | Not null, default 0 | How many retry attempts |
| is_fallback | Boolean | Not null, default false | Was this a fallback execution? |
| fallback_for | String(100) | Nullable | node_id of the original agent this replaced |
| execution_order | Integer | Not null | Order in the execution plan |
| parallel_group | Integer | Not null | Which parallel group this agent belongs to |
| started_at | DateTime(tz) | Nullable | |
| completed_at | DateTime(tz) | Nullable | |

**Relationships:**
- Belongs to WorkflowExecution

**Indexes:**
- `execution_id` — for listing agents per execution
- `(execution_id, agent_node_id)` — unique together for quick lookup

---

### MemoryEntry
**Purpose:** Vector memory store for agent communication within an execution.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, default uuid4 | |
| execution_id | UUID | FK → workflow_executions.id, Not null | |
| key | String(255) | Not null | Identifier for this memory entry |
| text | Text | Not null | Raw text content |
| embedding | Vector(1536) | Not null | pgvector embedding |
| metadata | JSONB | Nullable, default {} | Arbitrary metadata (agent_id, tags, etc.) |
| created_at | DateTime(tz) | Not null, default now() | |

**Relationships:**
- Belongs to WorkflowExecution

**Indexes:**
- `execution_id` — for scoping memory queries to an execution
- IVFFlat index on `embedding` with cosine distance — for similarity search

---

## SQLAlchemy Models (Ready to Copy)

```python
# backend/src/models/workflow.py

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    graph_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    executions = relationship("WorkflowExecution", back_populates="workflow", cascade="all, delete-orphan")
```

```python
# backend/src/models/execution.py

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models import Base


class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    graph_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    budget_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_max_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_tokens_prompt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens_completion: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    estimated_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    execution_plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    workflow = relationship("Workflow", back_populates="executions")
    agent_executions = relationship("AgentExecution", back_populates="execution", cascade="all, delete-orphan")
    memory_entries = relationship("MemoryEntry", back_populates="execution", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_workflow_executions_workflow_id", "workflow_id"),
        Index("ix_workflow_executions_status", "status"),
        Index("ix_workflow_executions_created_at", "created_at"),
    )


class AgentExecution(Base):
    __tablename__ = "agent_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    execution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False
    )
    agent_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    tokens_prompt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_completion: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fallback_for: Mapped[str | None] = mapped_column(String(100), nullable=True)
    execution_order: Mapped[int] = mapped_column(Integer, nullable=False)
    parallel_group: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    execution = relationship("WorkflowExecution", back_populates="agent_executions")

    __table_args__ = (
        Index("ix_agent_executions_execution_id", "execution_id"),
        Index("ix_agent_executions_lookup", "execution_id", "agent_node_id", unique=True),
    )
```

```python
# backend/src/models/memory.py

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models import Base


class MemoryEntry(Base):
    __tablename__ = "memory_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    execution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(1536), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    execution = relationship("WorkflowExecution", back_populates="memory_entries")

    __table_args__ = (
        Index("ix_memory_entries_execution_id", "execution_id"),
    )


# NOTE: pgvector IVFFlat index must be created via Alembic migration after initial data:
# CREATE INDEX ix_memory_entries_embedding ON memory_entries
# USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

```python
# backend/src/models/__init__.py

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from src.models.workflow import Workflow
from src.models.execution import WorkflowExecution, AgentExecution
from src.models.memory import MemoryEntry

__all__ = ["Base", "Workflow", "WorkflowExecution", "AgentExecution", "MemoryEntry"]
```

---

## Initial Alembic Migration Notes
The first migration should:
1. `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
2. `CREATE EXTENSION IF NOT EXISTS "vector";`
3. Create all four tables with constraints and indexes
4. The IVFFlat index on memory_entries.embedding can be added later (needs data to be effective) — use a separate migration

---

## Seed Data
Not needed for V1. The visual builder creates workflows interactively. If useful for testing, seed a simple 3-node workflow via the API.
