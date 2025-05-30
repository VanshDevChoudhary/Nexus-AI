# Execution Engine — Architecture & Algorithm

## Overview

The execution engine is the core of nexus-ai. It takes a visual workflow graph, resolves it into a dependency-aware execution plan, runs agents in optimal parallel order, and handles failures through backtracking.

This document explains the algorithms, data structures, and design decisions. It's meant to be read alongside the source code in `src/engine/`.

---

## 1. Graph Representation

A workflow is a directed acyclic graph (DAG) where:
- **Nodes** are agents, tools, or conditional branches
- **Edges** define data flow: the output of a source node feeds as input to the target node
- **Edge direction** implies dependency: if there's an edge from A → B, then B depends on A

The graph is stored as a JSONB blob in PostgreSQL. At execution time, the engine parses it into an internal adjacency list representation:

```
Internal DAG:
{
  "node_1": { "deps": [],              "dependents": ["node_3"] },
  "node_2": { "deps": [],              "dependents": ["node_3"] },
  "node_3": { "deps": ["node_1", "node_2"], "dependents": ["node_4"] },
  "node_4": { "deps": ["node_3"],      "dependents": [] }
}
```

Each node also carries its configuration: LLM provider, model, system prompt, retry settings, fallback reference, etc.

---

## 2. DAG Resolution

### 2.1 Cycle Detection

Before anything else, we validate the graph has no cycles. A cycle means circular dependencies (A needs B, B needs C, C needs A) — which is unsolvable.

**Algorithm:** Kahn's algorithm (BFS-based topological sort). If the topological ordering doesn't include all nodes, the graph has a cycle.

```
function detect_cycles(dag):
    in_degree = {node: len(node.deps) for node in dag}
    queue = [node for node in dag if in_degree[node] == 0]
    visited = 0

    while queue:
        node = queue.pop(0)
        visited += 1
        for dependent in dag[node].dependents:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if visited != len(dag):
        // Nodes not in visited are part of a cycle
        raise CircularDependencyError(unvisited_nodes)
```

**Complexity:** O(V + E) where V = nodes, E = edges.

If a cycle is detected, the engine returns an error with the nodes involved — not just "cycle detected" but specifically which nodes form the cycle. This matters for UX.

### 2.2 Topological Sort

Once validated, we topologically sort the nodes. This gives us a valid execution order where every node runs after all its dependencies.

We use the same Kahn's algorithm from cycle detection — the order in which nodes are dequeued IS the topological order.

### 2.3 Parallel Group Extraction

A topological sort gives us a valid serial order, but we want parallelism. Two nodes can run in parallel if neither depends on the other (directly or transitively).

**Algorithm:** We assign each node to the earliest possible "group" based on its dependencies.

```
function extract_parallel_groups(dag, sorted_nodes):
    group_assignment = {}

    for node in sorted_nodes:
        if node has no dependencies:
            group_assignment[node] = 0
        else:
            // This node's group = max group of its dependencies + 1
            max_dep_group = max(group_assignment[dep] for dep in node.deps)
            group_assignment[node] = max_dep_group + 1

    // Invert: group_number → list of nodes
    groups = group_by(group_assignment, key=group_number)
    return sorted(groups, by=group_number)
```

**Example:**

```
Workflow:
    A ──→ C ──→ E
    B ──→ D ──→ E

DAG resolution:
    A: deps=[], group=0
    B: deps=[], group=0
    C: deps=[A], group=1
    D: deps=[B], group=1
    E: deps=[C,D], group=2

Execution plan:
    Group 0: [A, B]       ← run in parallel
    Group 1: [C, D]       ← run in parallel (after group 0)
    Group 2: [E]           ← runs after group 1

Without parallelism: 5 sequential LLM calls
With parallelism: 3 rounds of LLM calls (A∥B, then C∥D, then E)
```

**Complexity:** O(V + E) — single pass through sorted nodes, checking each node's dependencies.

### 2.4 Execution Plan Output

The planner produces an `ExecutionPlan`:

```json
{
  "groups": [
    {
      "group": 0,
      "agents": [
        { "node_id": "node_1", "config": { ... } },
        { "node_id": "node_2", "config": { ... } }
      ]
    },
    {
      "group": 1,
      "agents": [
        { "node_id": "node_3", "config": { ... } }
      ]
    }
  ],
  "total_agents": 3,
  "max_parallelism": 2,
  "estimated_rounds": 2
}
```

This plan is stored in the `WorkflowExecution.execution_plan` column for debugging and the execution detail view.

---

## 3. Execution Flow

### 3.1 Overview

```
User hits "Run"
     │
     ▼
API validates graph (cycles? empty?)
     │
     ▼
Planner creates execution plan
     │
     ▼
Budget planner estimates cost (see BUDGET_PLANNER.md)
     │  
     ▼
Celery task dispatched ──→ Returns execution_id to user immediately
     │
     ▼
Executor iterates through parallel groups:
     │
     ├─ Group 0: gather(agent_A, agent_B)  ← parallel
     │     │
     │     ▼
     ├─ Group 1: gather(agent_C, agent_D)  ← parallel, receives outputs from group 0
     │     │
     │     ▼
     └─ Group 2: agent_E                    ← receives outputs from group 1
           │
           ▼
     Execution complete → publish final event
```

### 3.2 Data Flow Between Agents

When Agent C depends on Agent A, the executor:

1. Waits for Agent A to complete
2. Takes Agent A's output
3. Prepends it to Agent C's input as context

The input construction for each agent:
```
agent_input = {
    "user_input": <original workflow input, if this is a root agent>,
    "dependency_outputs": {
        "node_1": { "text": "Agent A's output...", "agent_name": "Summarizer" },
        "node_2": { "text": "Agent B's output...", "agent_name": "Researcher" }
    },
    "memory_recall": [...]  // if memory_recall_query is configured
}
```

The agent's system prompt + this constructed input is sent to the LLM.

### 3.3 Conditional Branches

Conditional nodes evaluate a condition on an upstream agent's output:

```
Agent A → [Condition: output contains "urgent"] → Agent B (urgent path)
       → [Condition: default]                   → Agent C (normal path)
```

After Agent A completes, the executor evaluates each outgoing edge's condition:
- **Exact match:** output text equals the condition string
- **Contains:** output text contains the condition substring
- **Default:** always matches (fallback if no other condition matches)

Only agents on matching branches are queued for execution. Agents on non-matching branches are marked as "skipped — condition not met."

---

## 4. Backtracking & Failure Recovery

When an agent fails, the engine doesn't just stop. It follows a decision tree:

```
Agent fails
     │
     ▼
Retries remaining?
     ├─ YES → Retry (with backoff delay)
     │         └─ Still failing? → Loop back to "Retries remaining?"
     │
     └─ NO → Fallback agent configured?
              ├─ YES → Execute fallback agent
              │         └─ Fallback also failed? → Treat as final failure
              │
              └─ NO → Is this agent's output required downstream?
                       ├─ YES → Mark downstream agents as "skipped"
                       │         Continue executing other independent branches
                       │
                       └─ NO → Continue execution normally
                                (this was an optional branch)
```

### 4.1 Retry Strategy

- Configurable per agent: `max_retries` (default: 2), `timeout_seconds` (default: 60)
- Backoff: 1s, 2s, 4s (exponential, capped at 10s)
- Each retry is logged as a separate attempt on the same AgentExecution record

### 4.2 Fallback Agents

- Any agent can designate another agent node as its fallback via `fallback_agent_id`
- The fallback runs with the same inputs the original agent received
- The fallback's execution is recorded as a separate AgentExecution with `is_fallback=true`
- If the fallback also fails, it does NOT trigger another fallback (no fallback chains — too complex for V1)

### 4.3 Dependency Failure Propagation

When an agent fails without recovery:

```
A (failed, no fallback)
├── B depends on A → B is "skipped"
│   ├── D depends on B → D is "skipped"
│   └── E depends on B and C → E waits for C, runs with partial input if C succeeds
└── C does NOT depend on A → C runs normally
```

The propagation is recursive: if B is skipped and D depends on B, D is also skipped. But if E depends on both B and C, and C succeeds, E runs with only C's output. The agent's system prompt should be written to handle partial inputs gracefully.

### 4.4 Execution Status Resolution

After all groups have been processed:
- **"completed"** — all agents succeeded (including via fallback)
- **"completed" with warnings** — some optional branches were skipped but core path succeeded
- **"failed"** — all root-level agents failed OR no useful output was produced
- **"budget_exceeded"** — budget ceiling was hit mid-execution

---

## 5. Concurrency Model

The engine uses Python's `asyncio` for concurrent agent execution:

```python
async def execute_group(group, completed_outputs):
    tasks = []
    for agent in group.agents:
        input_data = collect_inputs(agent, completed_outputs)
        tasks.append(execute_single_agent(agent, input_data))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    # Handle exceptions per-agent (triggers backtracking)
```

Within a parallel group, all agents start simultaneously. The group completes when all agents in it have finished (successfully, via fallback, or been marked as failed).

The Celery task itself runs the async executor in an event loop. This gives us both background execution (Celery) and within-task parallelism (asyncio).

---

## 6. Event Publishing

During execution, the engine publishes events to Redis pub/sub for real-time streaming:

```python
async def publish_event(execution_id, event_type, data):
    channel = f"execution:{execution_id}"
    event = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    await redis.publish(channel, json.dumps(event))
```

Events are published at every state transition: agent start, complete, fail, retry, fallback, skip, budget warning, and execution complete. The WebSocket handler subscribes to the channel and forwards events to connected clients.

---

## 7. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Kahn's algorithm over DFS for cycle detection | BFS-based, naturally produces topological order as a side effect. One algorithm, two results. |
| Parallel group extraction over just topological sort | Topological sort gives a valid serial order, but we'd leave parallelism performance gains on the table. Group extraction is O(V+E) — negligible cost for significant execution speedup. |
| asyncio.gather over thread pool | LLM calls are I/O-bound (waiting for HTTP responses). asyncio is the right model — no GIL concerns, efficient event loop. |
| No fallback chains | Fallback-of-fallback-of-fallback adds complexity with diminishing returns. One level of fallback covers 95% of cases. |
| Partial execution over all-or-nothing | A 10-agent workflow where 1 optional branch fails should still produce results. Real systems are resilient, not brittle. |
| Store execution plan in DB | Enables the execution detail view to show what the planner decided, not just what happened. Useful for debugging and post-execution analysis. |

---

## 8. Limitations (V1)

- No dynamic replanning: if an agent fails, the plan doesn't restructure. It follows the fallback/skip path but doesn't create a new optimal plan.
- No streaming of individual agent outputs (token by token). Agents return complete outputs. Streaming is V2.
- Memory is per-execution only. No cross-execution memory persistence.
- Maximum 50 nodes per workflow (artificial cap for V1 sanity).
- No human-in-the-loop gates. The entire execution is automated.

---

## References

- `src/engine/planner.py` — DAG resolution and parallel group extraction
- `src/engine/executor.py` — Execution loop and data flow
- `src/engine/backtrack.py` — Retry, fallback, and propagation logic
- `tests/test_planner.py` — Edge case tests for the planner
- `tests/test_backtrack.py` — Failure scenario tests
