import type {
  Workflow,
  WorkflowCreatePayload,
  WorkflowListResponse,
  WorkflowUpdatePayload,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.detail?.message || body?.error?.message || `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return res.json();
}

export async function fetchHealth(): Promise<{
  status: string;
  database: string;
  redis: string;
}> {
  return request("/api/v1/health");
}

export async function listWorkflows(
  skip = 0,
  limit = 20,
  sort = "created_at",
  order = "desc",
): Promise<WorkflowListResponse> {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    sort,
    order,
  });
  return request(`/api/v1/workflows?${params}`);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const res = await request<{ data: Workflow }>(`/api/v1/workflows/${id}`);
  return res.data;
}

export async function createWorkflow(payload: WorkflowCreatePayload): Promise<Workflow> {
  const res = await request<{ data: Workflow }>("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateWorkflow(
  id: string,
  payload: WorkflowUpdatePayload,
): Promise<Workflow> {
  const res = await request<{ data: Workflow }>(`/api/v1/workflows/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await request(`/api/v1/workflows/${id}`, { method: "DELETE" });
}
