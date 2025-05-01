from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class CircularDependencyError(Exception):
    def __init__(self, cycle_nodes: list[str]) -> None:
        self.cycle_nodes = cycle_nodes
        super().__init__(f"Circular dependency detected involving: {', '.join(cycle_nodes)}")


class EmptyWorkflowError(Exception):
    def __init__(self) -> None:
        super().__init__("Workflow has no nodes")


@dataclass
class AgentPlanEntry:
    node_id: str
    config: dict[str, Any]


@dataclass
class ParallelGroup:
    group: int
    agents: list[AgentPlanEntry] = field(default_factory=list)


@dataclass
class ExecutionPlan:
    groups: list[ParallelGroup]
    total_agents: int
    max_parallelism: int
    estimated_rounds: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "groups": [
                {
                    "group": g.group,
                    "agents": [
                        {"node_id": a.node_id, "config": a.config} for a in g.agents
                    ],
                }
                for g in self.groups
            ],
            "total_agents": self.total_agents,
            "max_parallelism": self.max_parallelism,
            "estimated_rounds": self.estimated_rounds,
        }


@dataclass
class DAGNode:
    node_id: str
    config: dict[str, Any]
    deps: list[str] = field(default_factory=list)
    dependents: list[str] = field(default_factory=list)


def parse_graph(graph_data: dict[str, Any]) -> dict[str, DAGNode]:
    """Convert raw graph_data (nodes + edges) into adjacency-list DAG."""
    nodes_raw = graph_data.get("nodes", [])
    edges_raw = graph_data.get("edges", [])

    dag: dict[str, DAGNode] = {}
    for node in nodes_raw:
        nid = node["id"]
        dag[nid] = DAGNode(
            node_id=nid,
            config=node.get("data", {}),
        )

    for edge in edges_raw:
        src = edge["source"]
        tgt = edge["target"]
        if src in dag and tgt in dag:
            dag[tgt].deps.append(src)
            dag[src].dependents.append(tgt)

    return dag


def detect_cycles(dag: dict[str, DAGNode]) -> None:
    """Kahn's BFS — raises CircularDependencyError if cycles exist."""
    in_degree = {nid: len(node.deps) for nid, node in dag.items()}
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    visited = 0

    while queue:
        nid = queue.pop(0)
        visited += 1
        for dep_id in dag[nid].dependents:
            in_degree[dep_id] -= 1
            if in_degree[dep_id] == 0:
                queue.append(dep_id)

    if visited != len(dag):
        cycle_nodes = [nid for nid, deg in in_degree.items() if deg > 0]
        raise CircularDependencyError(cycle_nodes)


def topological_sort(dag: dict[str, DAGNode]) -> list[str]:
    """Kahn's algorithm — returns topologically sorted node IDs."""
    in_degree = {nid: len(node.deps) for nid, node in dag.items()}
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result: list[str] = []

    while queue:
        queue.sort()  # deterministic ordering for same-priority nodes
        nid = queue.pop(0)
        result.append(nid)
        for dep_id in dag[nid].dependents:
            in_degree[dep_id] -= 1
            if in_degree[dep_id] == 0:
                queue.append(dep_id)

    return result


def extract_parallel_groups(
    dag: dict[str, DAGNode], sorted_nodes: list[str]
) -> list[ParallelGroup]:
    """Assign each node to earliest possible group based on dep groups."""
    group_of: dict[str, int] = {}

    for nid in sorted_nodes:
        node = dag[nid]
        if not node.deps:
            group_of[nid] = 0
        else:
            max_dep = max(group_of[d] for d in node.deps)
            group_of[nid] = max_dep + 1

    groups_map: dict[int, list[AgentPlanEntry]] = {}
    for nid in sorted_nodes:
        g = group_of[nid]
        if g not in groups_map:
            groups_map[g] = []
        groups_map[g].append(AgentPlanEntry(node_id=nid, config=dag[nid].config))

    return [
        ParallelGroup(group=g, agents=groups_map[g])
        for g in sorted(groups_map.keys())
    ]


def create_execution_plan(graph_data: dict[str, Any]) -> ExecutionPlan:
    nodes = graph_data.get("nodes", [])
    if not nodes:
        raise EmptyWorkflowError()

    dag = parse_graph(graph_data)
    detect_cycles(dag)
    sorted_nodes = topological_sort(dag)
    groups = extract_parallel_groups(dag, sorted_nodes)

    max_par = max(len(g.agents) for g in groups) if groups else 0
    total = sum(len(g.agents) for g in groups)

    return ExecutionPlan(
        groups=groups,
        total_agents=total,
        max_parallelism=max_par,
        estimated_rounds=len(groups),
    )
