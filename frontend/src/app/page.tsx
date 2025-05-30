"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteWorkflow, listWorkflows } from "@/lib/api";
import type { WorkflowListItem } from "@/lib/types";

export default function Home() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listWorkflows()
      .then((res) => {
        setWorkflows(res.data);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      await deleteWorkflow(id);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {total} workflow{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          New Workflow
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-md px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 text-sm py-8 justify-center">
          <div className="spinner" />
          Loading workflows...
        </div>
      )}

      {!loading && workflows.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg mb-2">No workflows yet</p>
          <p className="text-sm">
            Create your first workflow to start building agent pipelines.
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {workflows.map((w) => (
          <WorkflowCard
            key={w.id}
            workflow={w}
            onDelete={() => handleDelete(w.id, w.name)}
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onDelete,
}: {
  workflow: WorkflowListItem;
  onDelete: () => void;
}) {
  const exec = workflow.last_execution;
  const statusColor: Record<string, string> = {
    completed: "text-emerald-400",
    running: "text-blue-400",
    failed: "text-red-400",
    pending: "text-yellow-400",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <Link
          href={`/workflows/${workflow.id}`}
          className="flex-1 min-w-0"
        >
          <h3 className="font-semibold text-zinc-100 truncate">
            {workflow.name}
          </h3>
          {workflow.description && (
            <p className="text-zinc-400 text-sm mt-1 line-clamp-2">
              {workflow.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
            <span>{workflow.node_count} nodes</span>
            <span>{workflow.edge_count} edges</span>
            {exec && (
              <span className={statusColor[exec.status] || "text-zinc-400"}>
                Last run: {exec.status}
                {exec.total_cost > 0 && ` ($${exec.total_cost.toFixed(4)})`}
              </span>
            )}
          </div>
        </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="text-zinc-600 hover:text-red-400 transition-colors ml-4 p-1"
          title="Delete workflow"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
