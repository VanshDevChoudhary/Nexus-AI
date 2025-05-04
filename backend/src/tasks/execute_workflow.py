from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from src.celery_app import celery
from src.db import async_session
from src.engine.executor import execute_workflow
from src.engine.planner import AgentPlanEntry, ExecutionPlan, ParallelGroup

logger = logging.getLogger(__name__)


def _rebuild_plan(plan_dict: dict[str, Any]) -> ExecutionPlan:
    """Reconstruct ExecutionPlan from serialized dict."""
    groups = []
    for g in plan_dict["groups"]:
        agents = [AgentPlanEntry(node_id=a["node_id"], config=a["config"]) for a in g["agents"]]
        groups.append(ParallelGroup(group=g["group"], agents=agents))

    return ExecutionPlan(
        groups=groups,
        total_agents=plan_dict["total_agents"],
        max_parallelism=plan_dict["max_parallelism"],
        estimated_rounds=plan_dict["estimated_rounds"],
    )


@celery.task(name="execute_workflow_task", bind=True, max_retries=0)  # type: ignore[untyped-decorator]
def execute_workflow_task(
    self: Any,
    execution_id: str,
    plan_dict: dict[str, Any],
    graph_data: dict[str, Any],
    input_data: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Celery task — bridges sync Celery worker into async executor."""
    eid = uuid.UUID(execution_id)
    plan = _rebuild_plan(plan_dict)

    async def _run() -> None:
        async with async_session() as db:
            await execute_workflow(db, eid, plan, graph_data, input_data)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run())
    finally:
        loop.close()

    logger.info(f"Execution {execution_id} finished")
    return {"execution_id": execution_id, "status": "done"}
