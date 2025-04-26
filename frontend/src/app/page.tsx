"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

interface HealthStatus {
  status: string;
  database: string;
  redis: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <h1 className="text-3xl font-bold mb-2">nexus-ai</h1>
      <p className="text-zinc-400 mb-8">
        Multi-agent orchestration with visual workflow builder
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-4">
          System Status
        </h2>

        {error && (
          <div className="text-red-400 text-sm mb-3">
            Backend unreachable: {error}
          </div>
        )}

        {!health && !error && (
          <div className="text-zinc-500 text-sm">Checking...</div>
        )}

        {health && (
          <div className="space-y-3">
            <StatusRow label="API" value={health.status} />
            <StatusRow label="Database" value={health.database} />
            <StatusRow label="Redis" value={health.redis} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const ok = value === "healthy" || value === "ok";
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-300 text-sm">{label}</span>
      <span
        className={`text-sm font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}
      >
        {value}
      </span>
    </div>
  );
}
