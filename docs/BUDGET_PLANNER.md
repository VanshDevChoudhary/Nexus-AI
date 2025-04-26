# Budget Planner — Resource Optimization

## Overview

The budget planner solves a practical problem: LLM workflows can be expensive, and costs are hard to predict before execution. The planner provides three capabilities:

1. **Pre-execution estimation** — Predict what a workflow will cost before running it
2. **Budget suggestions** — When estimates exceed the budget, suggest what to cut
3. **Runtime enforcement** — Track costs during execution and halt if the ceiling is hit

All logic lives in `src/engine/budget.py`.

---

## 1. Pre-Execution Cost Estimation

### Algorithm

For each agent in the execution plan, estimate the total tokens and calculate cost:

```
function estimate_workflow_cost(plan, graph_data):
    total_cost = 0
    agent_estimates = []

    for group in plan.groups:
        for agent in group.agents:
            config = agent.config
            model_pricing = load_pricing(config.provider, config.model)

            // Estimate prompt tokens
            system_prompt_tokens = len(config.system_prompt) / 4  // rough: 1 token ≈ 4 chars
            input_tokens = estimate_input_size(agent, plan)       // from dependencies
            prompt_tokens = system_prompt_tokens + input_tokens

            // Completion tokens: use the agent's max_tokens setting as upper bound
            completion_tokens = config.max_tokens

            // Calculate cost
            prompt_cost = (prompt_tokens / 1000) * model_pricing.input_per_1k
            completion_cost = (completion_tokens / 1000) * model_pricing.output_per_1k
            agent_cost = prompt_cost + completion_cost

            agent_estimates.append({
                "node_id": agent.node_id,
                "model": config.model,
                "estimated_prompt_tokens": prompt_tokens,
                "estimated_completion_tokens": completion_tokens,
                "estimated_cost": agent_cost
            })

            total_cost += agent_cost

    return CostEstimate(
        total=total_cost,
        agents=agent_estimates,
        confidence="medium"  // explained below
    )
```

### Input Size Estimation

The tricky part is estimating how much input an agent will receive from its dependencies. We don't know the actual outputs yet — the workflow hasn't run.

**Heuristic:** Each dependency's output is estimated as `max_tokens * 0.6`. Most LLM responses don't use the full max_tokens allocation — 60% is a reasonable average.

```
function estimate_input_size(agent, plan):
    if agent has no dependencies:
        return 200  // base estimate for user's initial input

    total = 0
    for dep in agent.dependencies:
        dep_config = get_config(dep)
        total += dep_config.max_tokens * 0.6  // estimated output length
    
    // Add overhead for input formatting
    total += 50 * len(agent.dependencies)  // "Output from Agent X:" headers
    return total
```

### Confidence Levels

The estimate includes a confidence indicator:

| Level | Condition | Meaning |
|-------|-----------|---------|
| **high** | All agents have short system prompts, small max_tokens, no conditional branches | Estimate likely within 15% of actual |
| **medium** | Normal workflows with moderate complexity | Estimate likely within 30% of actual |
| **low** | Conditional branches present (some agents may not run), or agents have very large max_tokens | Estimate could be off by 50%+ |

Conditional branches reduce confidence because we don't know which path will be taken until runtime. The estimate assumes ALL branches execute (worst case).

---

## 2. Budget Suggestions

When the estimated cost exceeds the user's budget, the planner generates actionable suggestions.

### Suggestion Types

**1. Model Downgrade**

Replace an expensive model with a cheaper one. The planner knows the "downgrade path" for each provider:

```
Downgrade paths:
  openai: gpt-4o → gpt-4o-mini → gpt-3.5-turbo
  anthropic: claude-3.5-sonnet → claude-3-haiku
```

For each agent, calculate savings from downgrading:

```
savings = original_cost - downgraded_cost
```

Sort agents by savings descending — suggest downgrading the most expensive agent first.

**Impact assessment:** Model downgrades affect output quality. The suggestion includes:
- Which agent is affected
- Cost savings
- Quality note: "gpt-4o-mini may produce shorter or less nuanced outputs"

**2. Skip Optional Agent**

An agent is "optional" if no other agent in a required path depends on it. The planner identifies these by checking:

```
function is_optional(agent, plan):
    // An agent is optional if all paths from it lead to leaf nodes
    // that don't feed back into the main execution chain
    downstream = get_all_downstream(agent)
    return none of downstream are in the critical path
```

Skipping saves the agent's entire estimated cost.

**Impact assessment:** The suggestion explains what output will be missing.

### Suggestion Algorithm

```
function generate_suggestions(estimate, budget, plan, graph_data):
    gap = estimate.total - budget
    suggestions = []

    // Generate all possible model downgrades
    for agent in estimate.agents:
        for downgrade in get_downgrades(agent.model):
            savings = agent.cost - calculate_cost(agent, downgrade)
            suggestions.append(ModelDowngrade(agent, downgrade, savings))

    // Generate all possible skips
    for agent in estimate.agents:
        if is_optional(agent, plan):
            suggestions.append(SkipAgent(agent, agent.cost))

    // Sort by savings descending
    suggestions.sort(by=savings, descending=True)

    // Mark which suggestions would bring cost within budget
    running_savings = 0
    for s in suggestions:
        running_savings += s.savings
        s.cumulative_savings = running_savings
        s.would_fit_budget = (estimate.total - running_savings) <= budget

    return suggestions
```

### Example

```
Workflow: 4 agents
  Agent A: gpt-4o, estimated $0.15
  Agent B: gpt-4o, estimated $0.12
  Agent C: claude-3.5-sonnet, estimated $0.20
  Agent D: gpt-4o-mini, estimated $0.03  (depends on C, optional branch)

Total estimate: $0.50
Budget: $0.25
Gap: $0.25

Suggestions (sorted by savings):
1. Downgrade Agent C: claude-3.5-sonnet → claude-3-haiku  → saves $0.17
2. Downgrade Agent A: gpt-4o → gpt-4o-mini                → saves $0.13
3. Skip Agent D (optional)                                  → saves $0.03
4. Downgrade Agent B: gpt-4o → gpt-4o-mini                → saves $0.10

Applying suggestions 1 + 2 saves $0.30, bringing total to $0.20 — within budget. ✓
```

---

## 3. Runtime Budget Enforcement

Even with estimation, actual costs may differ. The enforcer tracks real costs during execution.

### Flow

```
Execution starts
     │
     ▼
BudgetEnforcer initialized with { max_tokens, max_cost }
     │
     ▼
Each agent completes → enforcer.record(agent_tokens, agent_cost)
     │
     ├─ Total < 80% of budget → continue normally
     │
     ├─ Total ≥ 80% of budget → publish "budget_warning" event
     │                           continue executing
     │
     └─ Total ≥ 100% of budget → publish "budget_exceeded" event
                                   stop dispatching new agents
                                   let currently-running agents finish
                                   mark remaining agents as "not_run"
```

### Implementation

```python
class BudgetEnforcer:
    def __init__(self, max_tokens=None, max_cost=None):
        self.max_tokens = max_tokens
        self.max_cost = max_cost
        self.used_tokens = 0
        self.used_cost = 0.0
        self.warned = False

    def record(self, tokens, cost):
        self.used_tokens += tokens
        self.used_cost += cost

    def check(self):
        if self.max_cost and self.used_cost >= self.max_cost:
            return "exceeded"
        if self.max_tokens and self.used_tokens >= self.max_tokens:
            return "exceeded"
        if not self.warned:
            if self.max_cost and self.used_cost >= self.max_cost * 0.8:
                self.warned = True
                return "warning"
            if self.max_tokens and self.used_tokens >= self.max_tokens * 0.8:
                self.warned = True
                return "warning"
        return "ok"
```

### Edge Cases

**Currently-running agents when budget is exceeded:**
When the enforcer says "exceeded," agents already dispatched in the current parallel group are allowed to finish. Only future groups are cancelled. This prevents wasting the work already in progress.

**No budget set:**
If both `max_tokens` and `max_cost` are null, the enforcer is a no-op. It still tracks totals for the execution report, but never triggers warnings or halts.

**Token budget vs cost budget:**
Both are tracked independently. Either one exceeding its ceiling triggers the halt. This lets users set a token limit for predictability OR a cost limit for actual spend control, or both.

---

## 4. Pricing Configuration

Model pricing is stored in `pricing/models.json`, not hardcoded:

```json
{
  "openai": {
    "gpt-4o": { "input_per_1k": 0.0025, "output_per_1k": 0.01 },
    "gpt-4o-mini": { "input_per_1k": 0.00015, "output_per_1k": 0.0006 },
    "gpt-3.5-turbo": { "input_per_1k": 0.0005, "output_per_1k": 0.0015 }
  },
  "anthropic": {
    "claude-3.5-sonnet": { "input_per_1k": 0.003, "output_per_1k": 0.015 },
    "claude-3-haiku": { "input_per_1k": 0.00025, "output_per_1k": 0.00125 }
  }
}
```

The file is loaded once on startup and cached. When providers change pricing, updating this file and restarting is sufficient.

---

## 5. Limitations

- **Estimation accuracy is inherently limited.** We can't predict actual completion lengths — only set upper bounds. The 60% heuristic is a guess.
- **Conditional branches inflate estimates.** The estimator assumes all branches run (worst case). Actual costs may be significantly lower if most conditions aren't met.
- **No cost optimization across models.** The planner doesn't globally optimize "which combination of models minimizes cost while maintaining quality." It just suggests individual downgrades. True optimization is a V2 feature.
- **Memory operations aren't budgeted.** Embedding API calls for memory store/recall have token costs that aren't currently included in estimates. These are small but nonzero.

---

## References

- `src/engine/budget.py` — All budget planner logic
- `pricing/models.json` — Model pricing configuration
- `tests/test_budget.py` — Estimation accuracy and enforcement tests
