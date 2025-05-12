from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.adapters.anthropic_adapter import AnthropicAdapter
from src.adapters.base import BaseLLMAdapter, LLMResponse
from src.adapters.openai_adapter import OpenAIAdapter
from src.engine.backtrack import (
    DependencyFailureHandler,
    FallbackHandler,
    RetryConfig,
    RetryHandler,
)
from src.engine.planner import ExecutionPlan
from src.models.execution import AgentExecution, WorkflowExecution

logger = logging.getLogger(__name__)

_adapters: dict[str, BaseLLMAdapter] = {}


def _get_adapter(provider: str) -> BaseLLMAdapter:
    if provider not in _adapters:
        if provider == "openai":
            _adapters[provider] = OpenAIAdapter()
        elif provider == "anthropic":
            _adapters[provider] = AnthropicAdapter()
        else:
            raise ValueError(f"Unknown provider: {provider}")
    return _adapters[provider]


def _build_agent_prompt(
    node_config: dict[str, Any],
    dependency_outputs: dict[str, dict[str, str]],
    input_data: dict[str, Any] | None,
) -> str:
    """Construct the user prompt from workflow input + dependency outputs."""
    parts: list[str] = []

    if input_data:
        user_query = input_data.get("user_query", "")
        if user_query:
            parts.append(f"User input:\n{user_query}")

    if dependency_outputs:
        parts.append("Context from previous agents:")
        for node_id, output in dependency_outputs.items():
            agent_name = output.get("agent_name", node_id)
            text = output.get("text", "")
            parts.append(f"\n[{agent_name}]:\n{text}")

    if not parts:
        parts.append("No input provided.")

    return "\n\n".join(parts)


def _evaluate_condition(condition: str | None, output_text: str) -> bool:
    if condition is None or condition == "" or condition.lower() == "default":
        return True
    if output_text == condition:
        return True
    if condition in output_text:
        return True
    return False


async def _call_llm(
    adapter: BaseLLMAdapter,
    prompt: str,
    system_prompt: str,
    config: dict[str, Any],
) -> LLMResponse:
    return await adapter.complete(prompt=prompt, system_prompt=system_prompt, config=config)


async def _execute_agent_with_recovery(
    db: AsyncSession,
    execution_id: uuid.UUID,
    node_id: str,
    node_config: dict[str, Any],
    dependency_outputs: dict[str, dict[str, str]],
    input_data: dict[str, Any] | None,
    parallel_group: int,
    execution_order: int,
    node_configs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Run one agent with retry logic and fallback support."""
    provider = node_config.get("provider", "openai")
    model = node_config.get("model", "gpt-4o")
    system_prompt = node_config.get("system_prompt", "")

    agent_exec = AgentExecution(
        execution_id=execution_id,
        agent_node_id=node_id,
        agent_name=node_config.get("name", node_id),
        status="running",
        provider=provider,
        model_used=model,
        parallel_group=parallel_group,
        execution_order=execution_order,
        started_at=datetime.now(timezone.utc),
    )

    prompt = _build_agent_prompt(node_config, dependency_outputs, input_data)
    agent_exec.input_data = {
        "prompt": prompt,
        "system_prompt": system_prompt,
        "dependency_outputs": dependency_outputs,
    }

    db.add(agent_exec)
    await db.flush()

    adapter = _get_adapter(provider)

    max_retries = node_config.get("max_retries", 2)
    retry_handler = RetryHandler(RetryConfig(max_retries=max_retries))

    retry_result = await retry_handler.execute(
        _call_llm, adapter, prompt, system_prompt, node_config,
    )

    if retry_result.success:
        llm_resp: LLMResponse = retry_result.result
        agent_exec.status = "completed"
        agent_exec.output_data = {"text": llm_resp.text}
        agent_exec.tokens_prompt = llm_resp.tokens.prompt
        agent_exec.tokens_completion = llm_resp.tokens.completion
        agent_exec.cost = llm_resp.cost
        agent_exec.latency_ms = llm_resp.latency_ms
        agent_exec.retries = retry_result.attempts - 1
        agent_exec.completed_at = datetime.now(timezone.utc)
        await db.flush()

        return {
            "node_id": node_id,
            "status": "completed",
            "text": llm_resp.text,
            "agent_name": node_config.get("name", node_id),
            "tokens_prompt": llm_resp.tokens.prompt,
            "tokens_completion": llm_resp.tokens.completion,
            "cost": llm_resp.cost,
        }

    # retries exhausted — mark original as failed
    logger.error(f"Agent {node_id} failed after {retry_result.attempts} attempts")
    agent_exec.status = "failed"
    agent_exec.error_message = retry_result.error
    agent_exec.retries = retry_result.attempts - 1
    agent_exec.completed_at = datetime.now(timezone.utc)
    await db.flush()

    # check for fallback
    if FallbackHandler.should_fallback(node_config):
        fallback_id = FallbackHandler.get_fallback_id(node_config)
        assert fallback_id is not None
        fallback_cfg = node_configs.get(fallback_id, {})

        fb_result = await _execute_fallback(
            db=db,
            execution_id=execution_id,
            fallback_node_id=fallback_id,
            original_node_id=node_id,
            fallback_config=fallback_cfg,
            dependency_outputs=dependency_outputs,
            input_data=input_data,
            parallel_group=parallel_group,
            execution_order=execution_order,
        )
        return fb_result

    return {
        "node_id": node_id,
        "status": "failed",
        "error": retry_result.error,
    }


async def _execute_fallback(
    db: AsyncSession,
    execution_id: uuid.UUID,
    fallback_node_id: str,
    original_node_id: str,
    fallback_config: dict[str, Any],
    dependency_outputs: dict[str, dict[str, str]],
    input_data: dict[str, Any] | None,
    parallel_group: int,
    execution_order: int,
) -> dict[str, Any]:
    """Execute a fallback agent. No retries on fallback (V1)."""
    provider = fallback_config.get("provider", "openai")
    model = fallback_config.get("model", "gpt-4o")
    system_prompt = fallback_config.get("system_prompt", "")

    fb_exec = AgentExecution(
        execution_id=execution_id,
        agent_node_id=fallback_node_id,
        agent_name=fallback_config.get("name", fallback_node_id),
        status="running",
        provider=provider,
        model_used=model,
        parallel_group=parallel_group,
        execution_order=execution_order,
        is_fallback=True,
        fallback_for=original_node_id,
        started_at=datetime.now(timezone.utc),
    )

    prompt = _build_agent_prompt(fallback_config, dependency_outputs, input_data)
    fb_exec.input_data = {
        "prompt": prompt,
        "system_prompt": system_prompt,
        "dependency_outputs": dependency_outputs,
    }

    db.add(fb_exec)
    await db.flush()

    try:
        adapter = _get_adapter(provider)
        result: LLMResponse = await adapter.complete(
            prompt=prompt, system_prompt=system_prompt, config=fallback_config,
        )

        fb_exec.status = "completed"
        fb_exec.output_data = {"text": result.text}
        fb_exec.tokens_prompt = result.tokens.prompt
        fb_exec.tokens_completion = result.tokens.completion
        fb_exec.cost = result.cost
        fb_exec.latency_ms = result.latency_ms
        fb_exec.completed_at = datetime.now(timezone.utc)
        await db.flush()

        return {
            "node_id": original_node_id,
            "status": "completed",
            "text": result.text,
            "agent_name": fallback_config.get("name", fallback_node_id),
            "tokens_prompt": result.tokens.prompt,
            "tokens_completion": result.tokens.completion,
            "cost": result.cost,
            "is_fallback": True,
        }

    except Exception as exc:
        logger.error(f"Fallback {fallback_node_id} for {original_node_id} also failed: {exc}")
        fb_exec.status = "failed"
        fb_exec.error_message = str(exc)
        fb_exec.completed_at = datetime.now(timezone.utc)
        await db.flush()

        return {
            "node_id": original_node_id,
            "status": "failed",
            "error": str(exc),
        }


async def execute_workflow(
    db: AsyncSession,
    execution_id: uuid.UUID,
    plan: ExecutionPlan,
    graph_data: dict[str, Any],
    input_data: dict[str, Any] | None = None,
) -> None:
    """
    Run all parallel groups in order.
    Within each group, agents execute concurrently via asyncio.gather().
    """
    exec_record = await db.get(WorkflowExecution, execution_id)
    if not exec_record:
        logger.error(f"Execution {execution_id} not found")
        return

    exec_record.status = "running"
    exec_record.started_at = datetime.now(timezone.utc)
    await db.flush()

    node_configs: dict[str, dict[str, Any]] = {}
    for node in graph_data.get("nodes", []):
        node_configs[node["id"]] = node.get("data", {})

    edges = graph_data.get("edges", [])
    edges_from: dict[str, list[tuple[str, str | None]]] = {}
    for edge in edges:
        src = edge["source"]
        tgt = edge["target"]
        cond = edge.get("data", {}).get("condition") if edge.get("data") else None
        edges_from.setdefault(src, []).append((tgt, cond))

    completed_outputs: dict[str, dict[str, str]] = {}
    skipped_nodes: set[str] = set()
    order_counter = 0

    for group in plan.groups:
        tasks = []
        for agent_entry in group.agents:
            nid = agent_entry.node_id

            if nid in skipped_nodes:
                skipped_rec = AgentExecution(
                    execution_id=execution_id,
                    agent_node_id=nid,
                    agent_name=node_configs.get(nid, {}).get("name", nid),
                    status="skipped",
                    provider=node_configs.get(nid, {}).get("provider", "openai"),
                    model_used=node_configs.get(nid, {}).get("model", "gpt-4o"),
                    parallel_group=group.group,
                    execution_order=order_counter,
                    error_message="skipped — dependency failed",
                )
                db.add(skipped_rec)
                order_counter += 1
                continue

            should_run = True
            for edge in edges:
                if edge["target"] == nid:
                    src = edge["source"]
                    cond = edge.get("data", {}).get("condition") if edge.get("data") else None
                    if cond and src in completed_outputs:
                        src_text = completed_outputs[src].get("text", "")
                        if not _evaluate_condition(cond, src_text):
                            should_run = False

            if not should_run:
                skipped_rec = AgentExecution(
                    execution_id=execution_id,
                    agent_node_id=nid,
                    agent_name=node_configs.get(nid, {}).get("name", nid),
                    status="skipped",
                    provider=node_configs.get(nid, {}).get("provider", "openai"),
                    model_used=node_configs.get(nid, {}).get("model", "gpt-4o"),
                    parallel_group=group.group,
                    execution_order=order_counter,
                    error_message="skipped — condition not met",
                )
                db.add(skipped_rec)
                skipped_nodes.add(nid)
                order_counter += 1
                continue

            dep_outputs: dict[str, dict[str, str]] = {}
            node_cfg = node_configs.get(nid, {})

            for edge in edges:
                if edge["target"] == nid and edge["source"] in completed_outputs:
                    dep_outputs[edge["source"]] = completed_outputs[edge["source"]]

            current_order = order_counter
            order_counter += 1

            tasks.append(
                _execute_agent_with_recovery(
                    db=db,
                    execution_id=execution_id,
                    node_id=nid,
                    node_config=node_cfg,
                    dependency_outputs=dep_outputs,
                    input_data=input_data if not dep_outputs else None,
                    parallel_group=group.group,
                    execution_order=current_order,
                    node_configs=node_configs,
                )
            )

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for res in results:
                if isinstance(res, Exception):
                    logger.error(f"Unexpected error in agent execution: {res}")
                    continue
                if isinstance(res, dict):
                    nid = res["node_id"]
                    if res["status"] == "completed":
                        completed_outputs[nid] = {
                            "text": str(res.get("text", "")),
                            "agent_name": str(res.get("agent_name", nid)),
                        }
                        exec_record.total_tokens_prompt += res.get("tokens_prompt", 0)
                        exec_record.total_tokens_completion += res.get("tokens_completion", 0)
                        exec_record.total_cost += res.get("cost", 0.0)
                    elif res["status"] == "failed":
                        DependencyFailureHandler.propagate(nid, edges_from, skipped_nodes)

        await db.flush()

    # final status
    failed_q = await db.execute(
        select(AgentExecution).where(
            AgentExecution.execution_id == execution_id,
            AgentExecution.status == "failed",
        )
    )
    failed_agents = failed_q.scalars().all()

    if failed_agents and not completed_outputs:
        exec_record.status = "failed"
        exec_record.error_message = "All agents failed"
    elif failed_agents:
        exec_record.status = "completed"
    else:
        exec_record.status = "completed"

    exec_record.completed_at = datetime.now(timezone.utc)
    await db.commit()
