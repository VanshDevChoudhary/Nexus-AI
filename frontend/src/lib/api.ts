const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchHealth(): Promise<{
  status: string;
  database: string;
  redis: string;
}> {
  const res = await fetch(`${API_BASE}/api/v1/health`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return res.json();
}
