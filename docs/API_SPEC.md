# API Specification

## Project: nexus-ai
## Base URL: `/api/v1`
## Authentication: None (V1 — single user)
## Date: 2026-02-25

---

## General Conventions
- All request/response bodies are JSON
- Dates are ISO 8601 with timezone: `2026-02-25T14:30:00+00:00`
- UUIDs for all IDs
- Pagination: `?skip=0&limit=20` (default limit=20, max=100)
- Sorting: `?sort=created_at&order=desc` (default)

## Standard Success Response
```json
{
  "data": { ... }
}
```

## Standard List Response
```json
{
  "data": [ ... ],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

## Error Response Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {} 
  }
}
```

## Standard Error Codes
| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | BAD_REQUEST | Invalid input / validation error |
| 404 | NOT_FOUND | Resource doesn't exist |
| 409 | CONFLICT | Workflow is already executing |
| 422 | VALIDATION_ERROR | Pydantic validation failure (auto from FastAPI) |
| 500 | INTERNAL_ERROR | Something broke |

---

## Endpoints

---

### Workflows

#### GET `/api/v1/workflows`
**Purpose:** List all workflows
**Auth required:** No

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| skip | int | 0 | Pagination offset |
| limit | int | 20 | Page size (max 100) |
| sort | string | created_at | Sort field |
| order | string | desc | asc or desc |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Research Pipeline",
      "description": "Summarizes and analyzes research papers",
      "node_count": 5,
      "edge_count": 4,
      "created_at": "2026-02-25T10:00:00+00:00",
      "updated_at": "2026-02-25T12:30:00+00:00",
      "last_execution": {
        "id": "uuid",
        "status": "completed",
        "total_cost": 0.045,
        "completed_at": "2026-02-25T12:31:00+00:00"
      }
    }
  ],
  "total": 3,
  "skip": 0,
  "limit": 20
}
```

---

#### POST `/api/v1/workflows`
**Purpose:** Create a new workflow
**Auth required:** No

**Request:**
```json
{
  "name": "Research Pipeline",
  "description": "Optional description",
  "graph_data": {
    "nodes": [
      {
        "id": "node_1",
        "type": "agent",
        "position": { "x": 100, "y": 200 },
        "data": {
          "name": "Summarizer",
          "provider": "openai",
          "model": "gpt-4o",
          "system_prompt": "Summarize the input text.",
          "temperature": 0.7,
          "max_tokens": 1000,
          "max_retries": 2,
          "timeout_seconds": 60,
          "fallback_agent_id": null
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "target": "node_2",
        "data": { "condition": null }
      }
    ]
  }
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | Yes | 1-255 chars |
| description | string | No | Max 2000 chars |
| graph_data | object | Yes | Must contain nodes array and edges array |

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Research Pipeline",
    "description": "Optional description",
    "graph_data": { ... },
    "created_at": "2026-02-25T10:00:00+00:00",
    "updated_at": "2026-02-25T10:00:00+00:00"
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Missing name | 422 | VALIDATION_ERROR |
| Invalid graph structure | 400 | BAD_REQUEST |

---

#### GET `/api/v1/workflows/{id}`
**Purpose:** Get a workflow with full graph data
**Auth required:** No

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Research Pipeline",
    "description": "Optional description",
    "graph_data": { ... },
    "created_at": "2026-02-25T10:00:00+00:00",
    "updated_at": "2026-02-25T12:30:00+00:00"
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Workflow not found | 404 | NOT_FOUND |

---

#### PUT `/api/v1/workflows/{id}`
**Purpose:** Update a workflow (name, description, or graph)
**Auth required:** No

**Request:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "graph_data": { ... }
}
```
All fields optional — only provided fields are updated.

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Updated Name",
    ...
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Workflow not found | 404 | NOT_FOUND |
| Invalid graph structure | 400 | BAD_REQUEST |

---

#### DELETE `/api/v1/workflows/{id}`
**Purpose:** Delete a workflow and all its executions
**Auth required:** No

**Response (200):**
```json
{
  "data": {
    "deleted": true,
    "id": "uuid"
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Workflow not found | 404 | NOT_FOUND |

---

### Executions

#### POST `/api/v1/workflows/{id}/execute`
**Purpose:** Trigger a workflow execution. Returns immediately — execution runs in background via Celery.
**Auth required:** No

**Request:**
```json
{
  "input_data": {
    "user_query": "Analyze this research paper..."
  },
  "budget": {
    "max_tokens": 50000,
    "max_cost": 0.50
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| input_data | object | No | Initial data passed to root agents (agents with no dependencies) |
| budget.max_tokens | int | No | Null = unlimited |
| budget.max_cost | float | No | Null = unlimited. In USD. |

**Response (202 Accepted):**
```json
{
  "data": {
    "execution_id": "uuid",
    "status": "pending",
    "estimated_cost": 0.32,
    "budget_warnings": [
      "Estimated cost ($0.32) is within budget ($0.50) but leaves little margin"
    ],
    "websocket_url": "/ws/executions/uuid"
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Workflow not found | 404 | NOT_FOUND |
| Workflow has circular dependencies | 400 | CIRCULAR_DEPENDENCY |
| Workflow has no nodes | 400 | EMPTY_WORKFLOW |
| Estimated cost exceeds budget | 400 | BUDGET_EXCEEDED_ESTIMATE |
| Workflow already has a running execution | 409 | CONFLICT |

**Note on BUDGET_EXCEEDED_ESTIMATE:** The response includes the estimate and suggested cuts:
```json
{
  "error": {
    "code": "BUDGET_EXCEEDED_ESTIMATE",
    "message": "Estimated cost ($0.85) exceeds budget ($0.50)",
    "details": {
      "estimated_cost": 0.85,
      "budget": 0.50,
      "suggestions": [
        { "action": "downgrade_model", "agent": "node_2", "from": "gpt-4o", "to": "gpt-4o-mini", "saves": 0.28 },
        { "action": "skip_agent", "agent": "node_4", "saves": 0.12, "impact": "Optional branch — no downstream dependencies" }
      ]
    }
  }
}
```

---

#### GET `/api/v1/executions/{id}`
**Purpose:** Get detailed execution results including per-agent breakdown
**Auth required:** No

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "workflow_id": "uuid",
    "workflow_name": "Research Pipeline",
    "status": "completed",
    "budget": {
      "max_tokens": 50000,
      "max_cost": 0.50
    },
    "totals": {
      "tokens_prompt": 12340,
      "tokens_completion": 3200,
      "tokens_total": 15540,
      "cost": 0.045,
      "duration_ms": 18500
    },
    "estimated_cost": 0.05,
    "execution_plan": {
      "groups": [
        { "group": 0, "agents": ["node_1", "node_2"] },
        { "group": 1, "agents": ["node_3"] },
        { "group": 2, "agents": ["node_4"] }
      ]
    },
    "agents": [
      {
        "id": "uuid",
        "agent_node_id": "node_1",
        "agent_name": "Summarizer",
        "status": "completed",
        "provider": "openai",
        "model_used": "gpt-4o",
        "tokens_prompt": 5000,
        "tokens_completion": 1200,
        "cost": 0.02,
        "latency_ms": 3200,
        "retries": 0,
        "is_fallback": false,
        "execution_order": 0,
        "parallel_group": 0,
        "input_data": { ... },
        "output_data": { "text": "Summary: ..." },
        "started_at": "...",
        "completed_at": "..."
      }
    ],
    "started_at": "2026-02-25T12:30:00+00:00",
    "completed_at": "2026-02-25T12:30:18+00:00",
    "created_at": "2026-02-25T12:29:59+00:00"
  }
}
```

**Errors:**
| Condition | Status | Code |
|-----------|--------|------|
| Execution not found | 404 | NOT_FOUND |

---

#### GET `/api/v1/workflows/{id}/executions`
**Purpose:** List all executions for a workflow
**Auth required:** No

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| skip | int | 0 | Pagination offset |
| limit | int | 20 | Page size |
| status | string | null | Filter by status |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "completed",
      "total_cost": 0.045,
      "total_tokens": 15540,
      "agent_count": 4,
      "duration_ms": 18500,
      "started_at": "...",
      "completed_at": "...",
      "created_at": "..."
    }
  ],
  "total": 12,
  "skip": 0,
  "limit": 20
}
```

---

### WebSocket

#### WS `/ws/executions/{execution_id}`
**Purpose:** Real-time execution event stream
**Protocol:** WebSocket

**Connection flow:**
1. Client connects to `/ws/executions/{execution_id}`
2. Server validates execution exists → if not, closes with code 4004
3. Server subscribes to Redis channel `execution:{execution_id}`
4. Events are forwarded to client as JSON messages
5. On execution complete, server sends final event and closes with code 1000

**Event types:**

```json
// Agent started running
{
  "type": "agent_started",
  "agent_id": "node_1",
  "agent_name": "Summarizer",
  "parallel_group": 0,
  "timestamp": "2026-02-25T12:30:01+00:00"
}

// Agent completed successfully
{
  "type": "agent_completed",
  "agent_id": "node_1",
  "agent_name": "Summarizer",
  "tokens": { "prompt": 5000, "completion": 1200 },
  "cost": 0.02,
  "latency_ms": 3200,
  "timestamp": "2026-02-25T12:30:04+00:00"
}

// Agent failed
{
  "type": "agent_failed",
  "agent_id": "node_2",
  "agent_name": "Analyzer",
  "error": "Timeout after 60s",
  "will_retry": true,
  "retries_remaining": 1,
  "timestamp": "..."
}

// Agent retrying
{
  "type": "agent_retrying",
  "agent_id": "node_2",
  "agent_name": "Analyzer",
  "retry_number": 1,
  "timestamp": "..."
}

// Fallback activated
{
  "type": "agent_fallback",
  "original_agent_id": "node_2",
  "fallback_agent_id": "node_5",
  "fallback_agent_name": "Backup Analyzer",
  "reason": "Max retries exhausted",
  "timestamp": "..."
}

// Agent skipped (dependency failed)
{
  "type": "agent_skipped",
  "agent_id": "node_3",
  "agent_name": "Reporter",
  "reason": "Dependency node_2 failed with no fallback",
  "timestamp": "..."
}

// Budget warning (>80% consumed)
{
  "type": "budget_warning",
  "consumed": { "tokens": 42000, "cost": 0.41 },
  "budget": { "max_tokens": 50000, "max_cost": 0.50 },
  "percentage": 82,
  "timestamp": "..."
}

// Budget exceeded — execution halting
{
  "type": "budget_exceeded",
  "consumed": { "tokens": 51200, "cost": 0.52 },
  "budget": { "max_tokens": 50000, "max_cost": 0.50 },
  "agents_not_run": ["node_4"],
  "timestamp": "..."
}

// Execution completed
{
  "type": "execution_completed",
  "status": "completed",
  "totals": {
    "tokens_prompt": 12340,
    "tokens_completion": 3200,
    "cost": 0.045,
    "duration_ms": 18500,
    "agents_completed": 4,
    "agents_failed": 0,
    "agents_skipped": 0
  },
  "timestamp": "..."
}
```

**Client reconnection:**
- If the WebSocket disconnects, the client should call `GET /api/v1/executions/{id}` to get current state and update the UI, then reconnect to the WebSocket if execution is still running.

---

### Health Check

#### GET `/api/v1/health`
**Purpose:** Service health check
**Auth required:** No

**Response (200):**
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "celery": "workers_active"
  }
}
```
