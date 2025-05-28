export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  name: string;
  provider: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  max_retries: number;
  timeout_seconds: number;
  fallback_agent_id: string | null;
  // memory
  memory_store_key?: string | null;
  memory_recall_query?: string | null;
  // tool
  tool_type?: string | null;
  tool_config?: Record<string, unknown> | null;
  // conditional
  condition?: string | null;
  branches?: Record<string, string> | null;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: "agent" | "tool" | "conditional";
  position: Position;
  data: NodeData;
}

export interface EdgeData {
  condition?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: EdgeData | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  graph_data: GraphData;
  created_at: string;
  updated_at: string;
}

export interface LastExecution {
  id: string;
  status: string;
  total_cost: number;
  completed_at: string | null;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  node_count: number;
  edge_count: number;
  created_at: string;
  updated_at: string;
  last_execution: LastExecution | null;
}

export interface WorkflowListResponse {
  data: WorkflowListItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface WorkflowCreatePayload {
  name: string;
  description?: string | null;
  graph_data: GraphData;
}

export interface WorkflowUpdatePayload {
  name?: string;
  description?: string | null;
  graph_data?: GraphData;
}

// --- Execution types ---

export interface ExecuteBudget {
  max_tokens?: number | null;
  max_cost?: number | null;
}

export interface ExecuteWorkflowPayload {
  input_data?: Record<string, unknown> | null;
  budget?: ExecuteBudget | null;
}

export interface ExecuteWorkflowResponse {
  execution_id: string;
  status: string;
  estimated_cost: number | null;
  budget_warnings: string[];
  websocket_url: string;
}

export type AgentNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "skipped";

export interface ExecutionTotals {
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
  duration_ms: number;
  agents_completed: number;
  agents_failed: number;
  agents_skipped: number;
}

// WebSocket event types
export interface WsAgentStarted {
  type: "agent_started";
  agent_id: string;
  agent_name: string;
  parallel_group: number;
  timestamp: string;
}

export interface WsAgentCompleted {
  type: "agent_completed";
  agent_id: string;
  agent_name: string;
  tokens: { prompt: number; completion: number };
  cost: number;
  latency_ms: number;
  timestamp: string;
}

export interface WsAgentFailed {
  type: "agent_failed";
  agent_id: string;
  agent_name: string;
  error: string;
  will_retry: boolean;
  retries_remaining: number;
  timestamp: string;
}

export interface WsAgentRetrying {
  type: "agent_retrying";
  agent_id: string;
  agent_name: string;
  retry_number: number;
  timestamp: string;
}

export interface WsAgentFallback {
  type: "agent_fallback";
  original_agent_id: string;
  fallback_agent_id: string;
  fallback_agent_name: string;
  reason: string;
  timestamp: string;
}

export interface WsAgentSkipped {
  type: "agent_skipped";
  agent_id: string;
  agent_name: string;
  reason: string;
  timestamp: string;
}

export interface WsBudgetWarning {
  type: "budget_warning";
  consumed: { tokens: number; cost: number };
  budget: { max_tokens: number | null; max_cost: number | null };
  percentage: number;
  timestamp: string;
}

export interface WsBudgetExceeded {
  type: "budget_exceeded";
  consumed: { tokens: number; cost: number };
  budget: { max_tokens: number | null; max_cost: number | null };
  agents_not_run: string[];
  timestamp: string;
}

export interface WsExecutionCompleted {
  type: "execution_completed";
  status: string;
  totals: ExecutionTotals;
  timestamp: string;
}

export type WsEvent =
  | WsAgentStarted
  | WsAgentCompleted
  | WsAgentFailed
  | WsAgentRetrying
  | WsAgentFallback
  | WsAgentSkipped
  | WsBudgetWarning
  | WsBudgetExceeded
  | WsExecutionCompleted;

export interface ExecutionDetailResponse {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  budget: ExecuteBudget | null;
  totals: {
    tokens_prompt: number;
    tokens_completion: number;
    tokens_total: number;
    cost: number;
    duration_ms: number | null;
  };
  estimated_cost: number | null;
  agents: {
    id: string;
    agent_node_id: string;
    agent_name: string;
    status: string;
    provider: string;
    model_used: string;
    tokens_prompt: number;
    tokens_completion: number;
    cost: number;
    latency_ms: number | null;
    retries: number;
    is_fallback: boolean;
    execution_order: number;
    parallel_group: number;
  }[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
