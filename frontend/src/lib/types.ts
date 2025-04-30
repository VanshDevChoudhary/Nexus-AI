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
