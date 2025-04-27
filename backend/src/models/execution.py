import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
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
    agent_executions = relationship(
        "AgentExecution", back_populates="execution", cascade="all, delete-orphan"
    )
    memory_entries = relationship(
        "MemoryEntry", back_populates="execution", cascade="all, delete-orphan"
    )

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
        UUID(as_uuid=True),
        ForeignKey("workflow_executions.id", ondelete="CASCADE"),
        nullable=False,
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
