# nexus-ai

Multi-agent AI orchestration with DAG execution, backtracking, and budget planning.

> Most agent frameworks are just for-loops over API calls. This one isn't.

nexus-ai lets you build multi-agent workflows visually, resolves them into dependency-aware execution plans, runs agents in optimal parallel order, handles failures through retries and fallbacks, and enforces resource budgets in real-time — all while streaming live status updates to a reactive frontend.

---

## What makes it different

- **DAG-based execution engine.** Workflows are directed acyclic graphs. The planner uses Kahn's algorithm for topological sorting and extracts parallel groups — agents that can run concurrently are identified automatically. A 5-agent linear chain takes 5 rounds; the same agents in a diamond pattern take 3.

- **Backtracking on failure.** When an agent fails, the engine retries with exponential backoff, falls back to alternative agents, and propagates dependency failures to downstream nodes. Partial execution is the default — one failing branch doesn't kill the entire workflow.

- **Resource budget planning.** Before execution, the planner estimates costs using model pricing data and token heuristics. Set a budget ceiling and the enforcer tracks spend in real-time, warning at 80% and halting at 100%. Get suggestions for model downgrades when estimates exceed your budget.

- **Visual workflow builder.** Drag-and-drop ReactFlow canvas with agent, tool, and conditional node types. Auto-layout via dagre. Live execution overlay shows node status in real-time over the same graph you built.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 14)                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ ReactFlow│  │ Exec Viewer  │  │ History / Detail Pages │  │
│  │ Canvas   │  │ (WebSocket)  │  │                       │  │
│  └────┬─────┘  └───────┬──────┘  └───────────┬───────────┘  │
│       │                │                      │              │
│       └────────┬───────┴──────────────────────┘              │
│                │ REST API                                    │
└────────────────┼─────────────────────────────────────────────┘
                 │
┌────────────────┼─────────────────────────────────────────────┐
│  Backend (FastAPI)                                           │
│                │                                             │
│  ┌─────────────▼──────────┐                                  │
│  │  Workflow API           │──────────────────┐              │
│  │  /api/v1/workflows      │                  │              │
│  │  /api/v1/executions     │                  │              │
│  └─────────────┬──────────┘                   │              │
│                │                              │              │
│                ▼                              ▼              │
│  ┌─────────────────────┐        ┌─────────────────────┐     │
│  │  Execution Engine    │        │  WebSocket Handler   │     │
│  │  ┌───────────────┐  │        │  Redis pub/sub →     │     │
│  │  │ DAG Planner   │  │        │  live events to UI   │     │
│  │  │ Executor      │  │        └──────────┬──────────┘     │
│  │  │ Backtracking  │  │                   │              │
│  │  │ Budget Enforcer│  │                   │              │
│  │  └───────────────┘  │                   │              │
│  └──────────┬──────────┘                   │              │
│             │                              │              │
│             ▼                              │              │
│  ┌──────────────────┐  ┌──────────────────┐│              │
│  │  LLM Adapters    │  │  Agent Memory    ││              │
│  │  OpenAI / Anthropic│ │  (pgvector)     ││              │
│  └──────────────────┘  └──────────────────┘│              │
│             │                              │              │
└─────────────┼──────────────────────────────┼──────────────┘
              │                              │
    ┌─────────▼─────────┐          ┌─────────▼─────────┐
    │  Celery + Redis   │          │  PostgreSQL 16     │
    │  (task queue +    │          │  + pgvector        │
    │   pub/sub)        │          │                    │
    └───────────────────┘          └────────────────────┘
```

---

## Quick start

```bash
git clone https://github.com/vanshdevchoudhary/nexus-ai.git
cd nexus-ai

# Set your API keys
cp .env.example .env
# Edit .env — add your OPENAI_API_KEY and/or ANTHROPIC_API_KEY

# Start everything
docker-compose up --build

# That's it. Open http://localhost:3000
```

The first startup runs database migrations automatically. Give it ~30 seconds for all services to be healthy.

**Services:**
| Service | URL | What it does |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Visual builder + execution UI |
| Backend API | http://localhost:8000 | REST + WebSocket endpoints |
| PostgreSQL | localhost:5432 | Workflows, executions, vector store |
| Redis | localhost:6379 | Task queue + real-time event pub/sub |

---

## Screenshots

> Screenshots coming soon — placeholder for now.

<!--
![Workflow Builder](docs/screenshots/builder.png)
![Execution Viewer](docs/screenshots/execution.png)
![Execution Detail](docs/screenshots/detail.png)
-->

---

## API

Full spec in [docs/API_SPEC.md](docs/API_SPEC.md). Quick overview:

```
GET    /api/v1/health                          Health check
GET    /api/v1/workflows                       List workflows
POST   /api/v1/workflows                       Create workflow
GET    /api/v1/workflows/:id                   Get workflow
PUT    /api/v1/workflows/:id                   Update workflow
DELETE /api/v1/workflows/:id                   Delete workflow
POST   /api/v1/workflows/:id/execute           Execute workflow
GET    /api/v1/workflows/:id/executions        Execution history
GET    /api/v1/executions/:id                  Execution detail
WS     /ws/executions/:id                      Live execution events
```

---

## How the engine works

Detailed writeups in [docs/EXECUTION_ENGINE.md](docs/EXECUTION_ENGINE.md) and [docs/BUDGET_PLANNER.md](docs/BUDGET_PLANNER.md). The short version:

1. You build a workflow graph in the visual editor
2. Hit "Run" — the backend parses the graph into a DAG
3. Kahn's algorithm detects cycles and produces a topological sort
4. Parallel group extraction finds which agents can run simultaneously
5. The executor iterates through groups, running each group's agents concurrently via `asyncio.gather()`
6. Failed agents are retried with exponential backoff, then fall back to designated alternatives
7. Downstream agents with failed dependencies are skipped; independent branches continue
8. Budget enforcement tracks cost per agent and halts execution if the ceiling is hit
9. Every state transition publishes a Redis event → WebSocket → live UI updates

**Complexity:** DAG resolution is O(V + E). Execution is bounded by the critical path length, not total agent count.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, ReactFlow 11 |
| Backend | Python, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Task queue | Celery + Redis |
| Database | PostgreSQL 16 + pgvector |
| Real-time | WebSockets + Redis pub/sub |
| LLM providers | OpenAI SDK, Anthropic SDK |
| Containerization | Docker + Docker Compose |

---

## Project structure

```
nexus-ai/
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js pages (App Router)
│   │   ├── components/             # ReactFlow canvas, nodes, modals
│   │   ├── hooks/                  # useWebSocket, useExecution
│   │   └── lib/                    # API client, types
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── api/                    # FastAPI routes
│   │   ├── engine/                 # Planner, executor, backtracking, budget
│   │   ├── adapters/               # OpenAI + Anthropic LLM adapters
│   │   ├── memory/                 # pgvector semantic memory store
│   │   ├── models/                 # SQLAlchemy models
│   │   ├── services/               # Business logic layer
│   │   └── tasks/                  # Celery task definitions
│   ├── alembic/                    # Database migrations
│   └── Dockerfile
├── docs/                           # Design docs, specs, algorithm writeups
├── pricing/models.json             # LLM model pricing config
├── docker-compose.yml
└── .env.example
```

---

## Known issues / Roadmap

**Known issues:**
- Cost estimation assumes all conditional branches execute (worst case). Actual costs are usually lower for workflows with many conditions.
- Memory embedding API calls aren't included in budget estimates. The cost is small but nonzero.
- Maximum 50 nodes per workflow (V1 cap).

**Not in V1 (intentionally):**
- Authentication (single-user portfolio project)
- Streaming token-by-token output from agents
- Dynamic replanning on failure (engine follows static fallback paths)
- Cross-execution memory persistence
- Human-in-the-loop approval gates
- Global model optimization for budget (currently suggests individual downgrades)

---

## License

[MIT](LICENSE)
