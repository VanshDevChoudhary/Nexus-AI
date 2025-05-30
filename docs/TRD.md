# Technical Requirements Document (TRD)

## 1. Overview
**Project:** nexus-ai
**Date:** 2025-04-20
**Based on PRD Version:** 1.0

### 1.1 Technical Summary
nexus-ai is a dual-stack application: a Next.js 14 frontend for the visual workflow builder and a Python FastAPI backend that houses the execution engine, DAG planner, and LLM orchestration. PostgreSQL with pgvector handles persistent storage and vector memory. Redis provides pub/sub for real-time WebSocket streaming and Celery task queue for background execution. Everything runs via Docker Compose.

---

## 2. System Architecture

### 2.1 Architecture Pattern
**Modular monolith (two services).** The frontend and backend are separate services but deployed together. Not microservices — that's overkill for V1. Not a single monolith — Python is better for the execution engine, TypeScript is better for the UI.

### 2.2 High-Level Architecture
```
┌─────────────────────────────┐
│   Browser (Desktop)         │
│   Next.js 14 App            │
│   - ReactFlow visual builder│
│   - Execution viewer        │
│   - WebSocket client        │
└────────┬────────────────────┘
         │ REST API (HTTP)
         │ WebSocket (WS)
         ▼
┌─────────────────────────────┐
│   FastAPI Backend            │
│   - REST API endpoints      │
│   - WebSocket server        │
│   - Execution engine        │
│   - DAG planner             │
│   - Budget planner          │
│   - LLM adapters            │
│   - Celery task dispatch    │
└────┬─────────┬──────────────┘
     │         │
     ▼         ▼
┌─────────┐ ┌───────────┐
│PostgreSQL│ │   Redis    │
│+ pgvector│ │- Pub/Sub   │
│- schemas │ │- Celery    │
│- vectors │ │  broker    │
└──────────┘ └───────────┘
```

### 2.3 Component Breakdown
| Component | Responsibility | Technology | Notes |
|-----------|---------------|-----------|-------|
| Visual Builder | Workflow creation UI, node editor, real-time execution view | Next.js 14 + ReactFlow 11 | Client-side heavy, uses App Router |
| API Layer | REST endpoints for CRUD + execution control | FastAPI | Auto-generates OpenAPI docs |
| WebSocket Server | Streams execution events to frontend | FastAPI WebSocket | One connection per active execution |
| Execution Engine | DAG resolution, parallel execution, backtracking | Python (asyncio) | Core of the project |
| Budget Planner | Pre-execution cost estimation, runtime budget enforcement | Python | Plugs into execution engine |
| LLM Adapters | Unified interface to OpenAI + Anthropic | Python + provider SDKs | Adapter pattern |
| Memory Store | Vector storage and retrieval for agent memory | pgvector + embedding API | Scoped per execution |
| Task Queue | Background execution of workflows | Celery + Redis | Prevents API timeout on long workflows |
| Database | Persistent storage | PostgreSQL 16 | SQLAlchemy 2.0 ORM |
| Cache/Pub-Sub | Real-time event broadcasting + task queue broker | Redis 7 | Single Redis instance, dual purpose |

---

## 3. Frontend Architecture

### 3.1 Framework & Routing
- **Framework:** Next.js 14 App Router
- **Routing strategy:** File-based routing, minimal dynamic routes
- **Key routes:**
  - `/` → Dashboard: list of workflows, recent executions
  - `/workflows/new` → New workflow builder (empty canvas)
  - `/workflows/[id]` → Edit existing workflow (loaded canvas)
  - `/workflows/[id]/executions` → Execution history for a workflow
  - `/workflows/[id]/executions/[execId]` → Execution detail view (agent-level breakdown)

### 3.2 State Management
- **Approach:** React state + ReactFlow's built-in store for canvas state. No global state library.
- **What needs component-level state:**
  - Canvas nodes and edges (ReactFlow handles this)
  - Selected node (for the properties panel)
  - Execution status (WebSocket updates)
  - Node status during execution (pending/running/success/failed)

### 3.3 Key UI Components
| Component | Purpose | Complexity |
|-----------|---------|-----------|
| WorkflowCanvas | ReactFlow canvas with custom node types | Complex |
| AgentNode | Custom ReactFlow node for LLM agents | Medium |
| ToolNode | Custom ReactFlow node for tool definitions | Medium |
| ConditionalNode | Custom ReactFlow node for branch logic | Medium |
| NodePropertiesPanel | Side panel to edit selected node config | Medium |
| ExecutionViewer | Real-time status overlay on canvas during execution | Complex |
| ExecutionReport | Post-execution detail view with agent breakdown | Medium |
| WorkflowList | Dashboard listing all workflows | Simple |
| BudgetConfig | Budget setting UI before execution | Simple |
| CostBreakdown | Token/cost display per agent and total | Simple |

### 3.4 API Client
- Use native `fetch` with a thin wrapper for base URL, error handling, and types
- No axios — unnecessary dependency
- WebSocket client: native `WebSocket` API with reconnection logic

---

## 4. Backend Architecture

### 4.1 API Design
- **Style:** REST
- **Base URL:** `/api/v1/`
- **No authentication in V1** — single user, scoped for the initial release
- **Request/Response format:** JSON everywhere. Pydantic models for validation.

### 4.2 Endpoint Summary
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/v1/workflows | List all workflows |
| POST | /api/v1/workflows | Create workflow |
| GET | /api/v1/workflows/{id} | Get workflow detail |
| PUT | /api/v1/workflows/{id} | Update workflow |
| DELETE | /api/v1/workflows/{id} | Delete workflow |
| POST | /api/v1/workflows/{id}/execute | Trigger execution |
| GET | /api/v1/executions/{id} | Get execution detail |
| GET | /api/v1/workflows/{id}/executions | List executions for workflow |
| WS | /ws/executions/{id} | Stream execution events |

Full spec in `docs/API_SPEC.md`.

### 4.3 Business Logic Layer
```
src/
├── api/              # FastAPI route handlers (thin — just HTTP concerns)
│   ├── workflows.py
│   ├── executions.py
│   └── websocket.py
├── engine/           # THE CORE — execution engine
│   ├── planner.py    # DAG resolution, execution order, parallel groups
│   ├── executor.py   # Runs the plan — dispatches agents, collects results
│   ├── backtrack.py  # Retry and fallback logic
│   └── budget.py     # Pre-execution estimation + runtime enforcement
├── adapters/         # LLM provider adapters
│   ├── base.py       # Abstract adapter interface
│   ├── openai.py     # OpenAI implementation
│   └── anthropic.py  # Anthropic implementation
├── memory/           # pgvector memory operations
│   └── store.py      # store() and recall() functions
├── models/           # SQLAlchemy ORM models
│   ├── workflow.py
│   ├── execution.py
│   └── memory.py
├── schemas/          # Pydantic request/response models
│   ├── workflow.py
│   ├── execution.py
│   └── common.py
├── services/         # Business logic between API and engine
│   ├── workflow_service.py
│   └── execution_service.py
├── tasks/            # Celery background tasks
│   └── execute_workflow.py
├── config.py         # Settings, env var loading
└── main.py           # FastAPI app factory
```

### 4.4 Background Execution with Celery
- Workflow execution is a Celery task, not a synchronous API call
- `POST /api/v1/workflows/{id}/execute` → creates an execution record → dispatches Celery task → returns execution ID immediately
- Celery task runs the engine, publishes events to Redis pub/sub
- WebSocket server subscribes to Redis pub/sub and forwards to connected clients

**Why Celery over just asyncio:**
- Workflows can take minutes (multiple LLM calls). Can't hold an HTTP connection that long.
- Celery gives retry mechanics, dead letter queue, and visibility for free.
- Redis is already there for pub/sub, doubling as Celery broker costs nothing.

---

## 5. Database Design

### 5.1 Database Choice & Justification
- **Primary DB:** PostgreSQL 16 — rock solid, pgvector extension for embeddings, JSON columns for flexible graph data
- **ORM:** SQLAlchemy 2.0 (async) + Alembic for migrations
- **Why not Prisma:** Backend is Python. SQLAlchemy is the standard.

### 5.2 Schema Overview
- `workflows` — Workflow definitions, graph data stored as JSONB
- `workflow_executions` — Execution instances with status, budget, cost totals
- `agent_executions` — Per-agent results within an execution
- `memory_entries` — Vector store for agent memory with pgvector

Full schema in `docs/DB_SCHEMA.md`.

### 5.3 Migration Strategy
- Alembic autogenerate migrations from SQLAlchemy models
- Migrations run on container startup via entrypoint script
- Version tracked in `alembic/versions/`

---

## 6. Authentication & Authorization
**V1: None.** Single user. No auth layer. API is open on localhost.

If/when auth is added (V3+), the plan would be:
- JWT-based auth via a middleware
- Role-based access per workspace

---

## 7. Third-Party Integrations
| Service | Purpose | Integration Method | Complexity |
|---------|---------|-------------------|-----------|
| OpenAI API | LLM completions + embeddings | Python SDK (`openai`) | Simple |
| Anthropic API | LLM completions | Python SDK (`anthropic`) | Simple |
| Redis | Pub/sub + Celery broker | `redis-py` + `celery[redis]` | Simple |
| pgvector | Vector similarity search | SQLAlchemy + pgvector extension | Medium |

### Integration Details:

**LLM Providers:**
- Each adapter wraps the provider's SDK
- Normalizes response to common format: `{ text, tokens: { prompt, completion }, model, latency_ms, cost }`
- Cost is calculated locally using a pricing config file, not from provider APIs
- Timeout per call: configurable, default 60 seconds
- All calls are async (`await`)

**pgvector:**
- Requires `CREATE EXTENSION vector` on the database (handled in Alembic migration)
- Embedding dimension: 1536 (text-embedding-3-small)
- Similarity metric: cosine distance
- Index: IVFFlat (good enough for V1 scale)

---

## 8. Real-time Architecture

### WebSocket Flow:
```
1. Frontend triggers execution via REST → gets execution_id
2. Frontend opens WebSocket to /ws/executions/{execution_id}
3. Celery task runs the engine
4. Engine publishes events to Redis channel: execution:{execution_id}
5. WebSocket handler subscribes to Redis channel
6. Events forwarded to frontend in real-time
7. On execution complete, WebSocket sends final event and closes
```

### Event Format:
```json
{
  "type": "agent_started | agent_completed | agent_failed | agent_retrying | execution_completed | budget_warning | budget_exceeded",
  "agent_id": "node_id or null",
  "data": { ... },
  "timestamp": "ISO8601"
}
```

### Reconnection:
- Frontend: exponential backoff reconnect (1s, 2s, 4s, max 30s)
- On reconnect: fetch current execution state via `GET /api/v1/executions/{id}` to sync up
- No event replay — just current state restoration

---

## 9. Error Handling & Logging
- **API errors:** Pydantic validation → 422. Business logic errors → appropriate 4xx. Unexpected errors → 500 with generic message.
- **Engine errors:** Caught per-agent. Logged to agent_execution record. Engine continues executing other branches.
- **Logging:** Python `logging` module. Structured JSON in production. Console in dev.
- **Monitoring:** None for V1. Docker logs are sufficient.

---

## 10. Environment & Configuration
| Variable | Purpose | Required |
|----------|---------|----------|
| DATABASE_URL | PostgreSQL connection string | Yes |
| REDIS_URL | Redis connection string | Yes |
| OPENAI_API_KEY | OpenAI API access | Yes (for OpenAI agents) |
| ANTHROPIC_API_KEY | Anthropic API access | Yes (for Anthropic agents) |
| EMBEDDING_MODEL | Model for memory embeddings | No (default: text-embedding-3-small) |
| CELERY_BROKER_URL | Celery broker (same as REDIS_URL) | Yes |
| FRONTEND_URL | Frontend origin for CORS | No (default: http://localhost:3000) |
| LOG_LEVEL | Logging verbosity | No (default: INFO) |

---

## 11. Security Considerations
- **Input validation:** Pydantic models on all API inputs. Reject unexpected fields.
- **SQL injection:** Protected by SQLAlchemy ORM. No raw SQL.
- **XSS:** React handles output escaping by default.
- **CORS:** Configured to allow only the frontend origin.
- **API keys:** Env vars only. Never logged. Never returned in API responses.
- **Rate limiting:** None for V1 (single user on localhost).
- **Docker:** Backend runs as non-root user inside container.

---

## 12. Performance Considerations
- **DAG resolution:** Must complete in <100ms for 20-node graphs. The planner uses topological sort — O(V+E), fast enough.
- **Parallel execution:** Python asyncio with `asyncio.gather()` for independent agents. Celery task is async-capable.
- **Database indexes:** On `workflow_executions.workflow_id`, `agent_executions.execution_id`, `memory_entries.execution_id`. pgvector IVFFlat index on embeddings.
- **Frontend:** ReactFlow handles canvas performance. Virtualization built-in for large graphs.
- **WebSocket:** One connection per execution. Redis pub/sub handles the fan-out. Negligible overhead at V1 scale.

---

## 13. Technical Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM API rate limits during parallel execution | Agents fail mid-workflow | Backtracking handles it. Also: stagger parallel calls with small delay if needed |
| pgvector embedding dimension mismatch | Memory store breaks | Lock to 1536 dimensions in schema. Validate on write. |
| Celery task dies mid-execution | Execution stuck in "running" state | Celery task acks late. Add a stale execution cleanup cron (check last heartbeat). |
| ReactFlow performance with 50+ nodes | UI sluggish | Cap workflow size at 50 nodes in V1. ReactFlow handles this fine but set boundary. |
| WebSocket disconnection during execution | Frontend shows stale state | REST fallback to fetch current state on reconnect |
| Docker Compose cold start takes too long | Bad DX on first run | Pre-built images + health checks + clear README instructions |

---

## 14. Directory Structure (Full Project)
```
nexus-ai/
├── LICENSE
├── README.md
├── docker-compose.yml
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── TRD.md
│   ├── API_SPEC.md
│   ├── DB_SCHEMA.md
│   ├── EXECUTION_ENGINE.md
│   └── BUDGET_PLANNER.md
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── workflows/
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── executions/
│   │   │   │           ├── page.tsx
│   │   │   │           └── [execId]/page.tsx
│   │   ├── components/
│   │   │   ├── canvas/
│   │   │   │   ├── WorkflowCanvas.tsx
│   │   │   │   ├── AgentNode.tsx
│   │   │   │   ├── ToolNode.tsx
│   │   │   │   ├── ConditionalNode.tsx
│   │   │   │   └── NodePropertiesPanel.tsx
│   │   │   ├── execution/
│   │   │   │   ├── ExecutionViewer.tsx
│   │   │   │   ├── ExecutionReport.tsx
│   │   │   │   └── CostBreakdown.tsx
│   │   │   ├── workflow/
│   │   │   │   ├── WorkflowList.tsx
│   │   │   │   └── BudgetConfig.tsx
│   │   │   └── ui/ (shared primitives)
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── websocket.ts
│   │   │   └── types.ts
│   │   └── hooks/
│   │       ├── useExecution.ts
│   │       └── useWebSocket.ts
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── workflows.py
│   │   │   ├── executions.py
│   │   │   └── websocket.py
│   │   ├── engine/
│   │   │   ├── __init__.py
│   │   │   ├── planner.py
│   │   │   ├── executor.py
│   │   │   ├── backtrack.py
│   │   │   └── budget.py
│   │   ├── adapters/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── openai.py
│   │   │   └── anthropic.py
│   │   ├── memory/
│   │   │   ├── __init__.py
│   │   │   └── store.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── workflow.py
│   │   │   ├── execution.py
│   │   │   └── memory.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── workflow.py
│   │   │   ├── execution.py
│   │   │   └── common.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── workflow_service.py
│   │   │   └── execution_service.py
│   │   └── tasks/
│   │       ├── __init__.py
│   │       └── execute_workflow.py
│   └── tests/
│       ├── test_planner.py
│       ├── test_backtrack.py
│       ├── test_budget.py
│       └── test_adapters.py
└── pricing/
    └── models.json   # LLM pricing config
```
