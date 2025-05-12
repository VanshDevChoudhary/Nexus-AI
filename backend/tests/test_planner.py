from __future__ import annotations

import pytest

from src.engine.planner import (
    CircularDependencyError,
    EmptyWorkflowError,
    create_execution_plan,
)


def _node(nid: str, name: str | None = None) -> dict:
    return {"id": nid, "data": {"name": name or nid, "provider": "openai", "model": "gpt-4o"}}


def _edge(src: str, tgt: str) -> dict:
    return {"source": src, "target": tgt}


class TestPlanner:
    def test_single_node(self):
        graph = {"nodes": [_node("a")], "edges": []}
        plan = create_execution_plan(graph)
        assert plan.total_agents == 1
        assert len(plan.groups) == 1
        assert plan.groups[0].agents[0].node_id == "a"

    def test_linear_chain(self):
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c")],
            "edges": [_edge("a", "b"), _edge("b", "c")],
        }
        plan = create_execution_plan(graph)
        assert plan.total_agents == 3
        assert len(plan.groups) == 3
        assert plan.groups[0].agents[0].node_id == "a"
        assert plan.groups[1].agents[0].node_id == "b"
        assert plan.groups[2].agents[0].node_id == "c"

    def test_parallel_agents(self):
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c")],
            "edges": [],
        }
        plan = create_execution_plan(graph)
        assert len(plan.groups) == 1
        assert plan.max_parallelism == 3
        node_ids = {a.node_id for a in plan.groups[0].agents}
        assert node_ids == {"a", "b", "c"}

    def test_diamond_dependency(self):
        """A→B, A→C, B→D, C→D"""
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c"), _node("d")],
            "edges": [_edge("a", "b"), _edge("a", "c"), _edge("b", "d"), _edge("c", "d")],
        }
        plan = create_execution_plan(graph)
        assert plan.total_agents == 4
        # A in group 0, B+C in group 1, D in group 2
        assert plan.groups[0].agents[0].node_id == "a"
        g1_ids = {a.node_id for a in plan.groups[1].agents}
        assert g1_ids == {"b", "c"}
        assert plan.groups[2].agents[0].node_id == "d"

    def test_circular_dependency(self):
        graph = {
            "nodes": [_node("a"), _node("b"), _node("c")],
            "edges": [_edge("a", "b"), _edge("b", "c"), _edge("c", "a")],
        }
        with pytest.raises(CircularDependencyError):
            create_execution_plan(graph)

    def test_wide_parallel(self):
        nodes = [_node(f"n{i}") for i in range(10)]
        graph = {"nodes": nodes, "edges": []}
        plan = create_execution_plan(graph)
        assert plan.total_agents == 10
        assert len(plan.groups) == 1
        assert plan.max_parallelism == 10

    def test_empty_workflow(self):
        with pytest.raises(EmptyWorkflowError):
            create_execution_plan({"nodes": [], "edges": []})
