from __future__ import annotations

from src.engine.budget import (
    BudgetEnforcer,
    estimate_workflow_cost,
    generate_budget_suggestions,
)
from src.engine.planner import create_execution_plan


def _node(
    nid: str,
    model: str = "gpt-4o",
    provider: str = "openai",
    max_tokens: int = 1000,
    system_prompt: str = "You are a helpful assistant.",
) -> dict:
    return {
        "id": nid,
        "data": {
            "name": nid,
            "provider": provider,
            "model": model,
            "system_prompt": system_prompt,
            "max_tokens": max_tokens,
        },
    }


def _edge(src: str, tgt: str) -> dict:
    return {"source": src, "target": tgt}


class TestEstimation:
    def test_single_agent_cost(self):
        graph = {"nodes": [_node("a")], "edges": []}
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)

        assert est.total > 0
        assert len(est.agents) == 1
        assert est.agents[0].node_id == "a"
        assert est.agents[0].estimated_prompt_tokens > 0
        assert est.agents[0].estimated_completion_tokens == 1000

    def test_multi_agent_sums(self):
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c")],
            "edges": [_edge("a", "b"), _edge("b", "c")],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)

        agent_sum = sum(a.estimated_cost for a in est.agents)
        assert abs(est.total - agent_sum) < 0.000001

    def test_estimation_within_bounds(self):
        """Estimate uses known token counts — verify math."""
        graph = {"nodes": [_node("a", max_tokens=500, system_prompt="Short.")], "edges": []}
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)

        ae = est.agents[0]
        assert ae.estimated_completion_tokens == 500
        assert ae.estimated_prompt_tokens < 500
        assert est.total > 0
        assert est.total < 0.10

    def test_dependency_inflates_prompt(self):
        graph = {
            "nodes": [_node("a", max_tokens=2000), _node("b", max_tokens=1000)],
            "edges": [_edge("a", "b")],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)

        a_est = next(e for e in est.agents if e.node_id == "a")
        b_est = next(e for e in est.agents if e.node_id == "b")
        # b depends on a, so its prompt should be larger
        assert b_est.estimated_prompt_tokens > a_est.estimated_prompt_tokens

    def test_confidence_high(self):
        graph = {"nodes": [_node("a", max_tokens=500)], "edges": []}
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        assert est.confidence == "high"

    def test_confidence_low_conditions(self):
        graph = {
            "nodes": [_node("a"), _node("b")],
            "edges": [{"source": "a", "target": "b", "data": {"condition": "approve"}}],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        assert est.confidence == "low"

    def test_confidence_low_large_tokens(self):
        graph = {"nodes": [_node("a", max_tokens=8000)], "edges": []}
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        assert est.confidence == "low"


class TestSuggestions:
    def test_suggestions_generated(self):
        graph = {
            "nodes": [_node("a", model="gpt-4o"), _node("b", model="gpt-4o")],
            "edges": [_edge("a", "b")],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        suggestions = generate_budget_suggestions(est, 0.001, plan, graph)

        assert len(suggestions) > 0
        actions = {s.action for s in suggestions}
        assert "downgrade_model" in actions

    def test_suggestions_sorted_by_savings(self):
        graph = {
            "nodes": [
                _node("a", model="gpt-4o", max_tokens=2000),
                _node("b", model="gpt-4o", max_tokens=500),
            ],
            "edges": [_edge("a", "b")],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        suggestions = generate_budget_suggestions(est, 0.001, plan, graph)

        for i in range(len(suggestions) - 1):
            assert suggestions[i].saves >= suggestions[i + 1].saves

    def test_skip_optional_agent(self):
        """Leaf node with no dependents should be flagged as skippable."""
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c")],
            "edges": [_edge("a", "b")],  # c is standalone leaf
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        suggestions = generate_budget_suggestions(est, 0.001, plan, graph)

        skip_suggestions = [s for s in suggestions if s.action == "skip_agent"]
        skippable_agents = {s.agent for s in skip_suggestions}
        # b and c are leaves (no outgoing edges), a has outgoing edge to b
        assert "b" in skippable_agents
        assert "c" in skippable_agents
        assert "a" not in skippable_agents

    def test_no_downgrades_for_cheapest(self):
        graph = {
            "nodes": [_node("a", model="gpt-3.5-turbo")],
            "edges": [],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        suggestions = generate_budget_suggestions(est, 0.0001, plan, graph)

        downgrades = [s for s in suggestions if s.action == "downgrade_model"]
        assert len(downgrades) == 0

    def test_anthropic_downgrade(self):
        graph = {
            "nodes": [_node("a", model="claude-3.5-sonnet", provider="anthropic")],
            "edges": [],
        }
        plan = create_execution_plan(graph)
        est = estimate_workflow_cost(plan, graph)
        suggestions = generate_budget_suggestions(est, 0.001, plan, graph)

        downgrades = [s for s in suggestions if s.action == "downgrade_model"]
        assert len(downgrades) == 1
        assert downgrades[0].to_model == "claude-3-haiku"


class TestBudgetEnforcer:
    def test_no_budget(self):
        enforcer = BudgetEnforcer()
        assert not enforcer.has_budget
        enforcer.record(10000, 1.0)
        assert enforcer.check() == "ok"

    def test_cost_warning_at_80pct(self):
        enforcer = BudgetEnforcer(max_cost=1.0)
        enforcer.record(0, 0.79)
        assert enforcer.check() == "ok"
        enforcer.record(0, 0.02)
        assert enforcer.check() == "warning"

    def test_cost_exceeded(self):
        enforcer = BudgetEnforcer(max_cost=0.50)
        enforcer.record(0, 0.50)
        assert enforcer.check() == "exceeded"

    def test_token_exceeded(self):
        enforcer = BudgetEnforcer(max_tokens=1000)
        enforcer.record(1000, 0.0)
        assert enforcer.check() == "exceeded"

    def test_token_warning(self):
        enforcer = BudgetEnforcer(max_tokens=1000)
        enforcer.record(800, 0.0)
        assert enforcer.check() == "warning"

    def test_warning_fires_once(self):
        enforcer = BudgetEnforcer(max_cost=1.0)
        enforcer.record(0, 0.85)
        assert enforcer.check() == "warning"
        # second check should not repeat warning
        assert enforcer.check() == "ok"

    def test_budget_halt_simulation(self):
        """Simulate multi-group execution with tight budget."""
        enforcer = BudgetEnforcer(max_cost=0.10)
        halted = False
        agents_not_run: list[str] = []

        groups = [["a", "b"], ["c"], ["d"]]
        costs = {"a": 0.04, "b": 0.05, "c": 0.03, "d": 0.02}

        for group in groups:
            if halted:
                agents_not_run.extend(group)
                continue
            for agent in group:
                enforcer.record(100, costs[agent])

            status = enforcer.check()
            if status == "exceeded":
                halted = True

        assert halted
        assert "d" in agents_not_run
        assert "a" not in agents_not_run

    def test_unlimited_execution(self):
        enforcer = BudgetEnforcer()
        for _ in range(100):
            enforcer.record(5000, 0.50)
            assert enforcer.check() == "ok"
