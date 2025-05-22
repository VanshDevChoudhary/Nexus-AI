from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from src.adapters.base import get_model_pricing
from src.engine.planner import ExecutionPlan

logger = logging.getLogger(__name__)

AVG_OUTPUT_RATIO = 0.6
BASE_INPUT_ESTIMATE = 200
FORMATTING_OVERHEAD_PER_DEP = 50
CHARS_PER_TOKEN = 4

DOWNGRADE_PATHS: dict[str, list[str]] = {
    "gpt-4o": ["gpt-4o-mini", "gpt-3.5-turbo"],
    "gpt-4o-mini": ["gpt-3.5-turbo"],
    "claude-3.5-sonnet": ["claude-3-haiku"],
}

MODEL_PROVIDER: dict[str, str] = {
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "gpt-3.5-turbo": "openai",
    "claude-3.5-sonnet": "anthropic",
    "claude-3-haiku": "anthropic",
}


@dataclass
class AgentEstimate:
    node_id: str
    model: str
    provider: str
    estimated_prompt_tokens: int
    estimated_completion_tokens: int
    estimated_cost: float


@dataclass
class CostEstimate:
    total: float
    agents: list[AgentEstimate]
    confidence: str


@dataclass
class BudgetSuggestion:
    action: str
    agent: str
    saves: float
    from_model: str | None = None
    to_model: str | None = None
    impact: str | None = None


def _estimate_agent_tokens(
    config: dict[str, Any],
    dep_configs: list[dict[str, Any]],
) -> tuple[int, int]:
    system_prompt = config.get("system_prompt", "")
    system_tokens = max(1, len(system_prompt) // CHARS_PER_TOKEN)

    if dep_configs:
        input_tokens = 0
        for dep_cfg in dep_configs:
            dep_max = dep_cfg.get("max_tokens", 1000)
            input_tokens += int(dep_max * AVG_OUTPUT_RATIO)
        input_tokens += FORMATTING_OVERHEAD_PER_DEP * len(dep_configs)
    else:
        input_tokens = BASE_INPUT_ESTIMATE

    prompt_tokens = system_tokens + input_tokens
    completion_tokens = config.get("max_tokens", 1000)
    return prompt_tokens, completion_tokens


def estimate_workflow_cost(
    plan: ExecutionPlan,
    graph_data: dict[str, Any],
) -> CostEstimate:
    nodes_raw = graph_data.get("nodes", [])
    edges_raw = graph_data.get("edges", [])

    configs: dict[str, dict[str, Any]] = {}
    for node in nodes_raw:
        configs[node["id"]] = node.get("data", {})

    deps_of: dict[str, list[str]] = {}
    for edge in edges_raw:
        tgt = edge["target"]
        deps_of.setdefault(tgt, []).append(edge["source"])

    has_conditions = any(
        edge.get("data", {}).get("condition")
        for edge in edges_raw
        if edge.get("data")
    )

    agent_estimates: list[AgentEstimate] = []
    total = 0.0

    for group in plan.groups:
        for agent in group.agents:
            cfg = configs.get(agent.node_id, agent.config)
            provider = cfg.get("provider", "openai")
            model = cfg.get("model", "gpt-4o")

            dep_ids = deps_of.get(agent.node_id, [])
            dep_cfgs = [configs.get(d, {}) for d in dep_ids]

            prompt_tokens, completion_tokens = _estimate_agent_tokens(cfg, dep_cfgs)

            pricing = get_model_pricing(provider, model)
            prompt_cost = (prompt_tokens / 1000) * pricing["input_per_1k"]
            completion_cost = (completion_tokens / 1000) * pricing["output_per_1k"]
            agent_cost = round(prompt_cost + completion_cost, 6)

            agent_estimates.append(AgentEstimate(
                node_id=agent.node_id,
                model=model,
                provider=provider,
                estimated_prompt_tokens=prompt_tokens,
                estimated_completion_tokens=completion_tokens,
                estimated_cost=agent_cost,
            ))
            total += agent_cost

    total = round(total, 6)

    max_tokens_values = [
        configs.get(a.node_id, a.config).get("max_tokens", 1000)
        for g in plan.groups for a in g.agents
    ]
    large_max = any(t > 4000 for t in max_tokens_values)

    if has_conditions or large_max:
        confidence = "low"
    elif plan.total_agents <= 3 and not large_max:
        confidence = "high"
    else:
        confidence = "medium"

    return CostEstimate(total=total, agents=agent_estimates, confidence=confidence)


def _is_optional(node_id: str, edges_raw: list[dict[str, Any]]) -> bool:
    for edge in edges_raw:
        if edge["source"] == node_id:
            return False
    return True


def generate_budget_suggestions(
    estimate: CostEstimate,
    budget: float,
    plan: ExecutionPlan,
    graph_data: dict[str, Any],
) -> list[BudgetSuggestion]:
    edges_raw = graph_data.get("edges", [])
    suggestions: list[BudgetSuggestion] = []

    for ae in estimate.agents:
        downgrades = DOWNGRADE_PATHS.get(ae.model, [])
        for target_model in downgrades:
            target_provider = MODEL_PROVIDER.get(target_model, ae.provider)
            pricing = get_model_pricing(target_provider, target_model)

            new_prompt_cost = (ae.estimated_prompt_tokens / 1000) * pricing["input_per_1k"]
            new_completion_cost = (ae.estimated_completion_tokens / 1000) * pricing["output_per_1k"]
            new_cost = round(new_prompt_cost + new_completion_cost, 6)
            savings = round(ae.estimated_cost - new_cost, 6)

            if savings > 0:
                suggestions.append(BudgetSuggestion(
                    action="downgrade_model",
                    agent=ae.node_id,
                    saves=savings,
                    from_model=ae.model,
                    to_model=target_model,
                    impact=f"{target_model} may produce shorter or less nuanced outputs",
                ))

    for ae in estimate.agents:
        if _is_optional(ae.node_id, edges_raw):
            suggestions.append(BudgetSuggestion(
                action="skip_agent",
                agent=ae.node_id,
                saves=ae.estimated_cost,
                impact="Optional branch — no downstream dependencies",
            ))

    suggestions.sort(key=lambda s: s.saves, reverse=True)
    return suggestions


class BudgetEnforcer:
    def __init__(
        self,
        max_tokens: int | None = None,
        max_cost: float | None = None,
    ) -> None:
        self.max_tokens = max_tokens
        self.max_cost = max_cost
        self.used_tokens = 0
        self.used_cost = 0.0
        self._warned = False

    @property
    def has_budget(self) -> bool:
        return self.max_tokens is not None or self.max_cost is not None

    def record(self, tokens: int, cost: float) -> None:
        self.used_tokens += tokens
        self.used_cost += cost

    def check(self) -> str:
        if self.max_cost is not None and self.used_cost >= self.max_cost:
            return "exceeded"
        if self.max_tokens is not None and self.used_tokens >= self.max_tokens:
            return "exceeded"

        if not self._warned:
            if self.max_cost is not None and self.used_cost >= self.max_cost * 0.8:
                self._warned = True
                return "warning"
            if self.max_tokens is not None and self.used_tokens >= self.max_tokens * 0.8:
                self._warned = True
                return "warning"

        return "ok"
