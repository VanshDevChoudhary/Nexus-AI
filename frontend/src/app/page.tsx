"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteWorkflow, listWorkflows } from "@/lib/api";
import type { WorkflowListItem } from "@/lib/types";

const WORKFLOW_ICONS = ["database", "edit_note", "support_agent", "hub", "psychology", "auto_fix_high"];

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
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Workflows</h1>
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">
              {total} total
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            Manage and monitor your automated AI pipelines
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-md px-4 py-3 text-sm mb-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.map((w, i) => (
          <WorkflowCard
            key={w.id}
            workflow={w}
            icon={WORKFLOW_ICONS[i % WORKFLOW_ICONS.length]}
            onDelete={() => handleDelete(w.id, w.name)}
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  icon,
  onDelete,
}: {
  workflow: WorkflowListItem;
  icon: string;
  onDelete: () => void;
}) {
  const exec = workflow.last_execution;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <Link href={`/workflows/${workflow.id}`} className="flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px]">
              {icon}
            </span>
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {workflow.name}
          </h3>
          {workflow.description && (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 line-clamp-2">
              {workflow.description}
            </p>
          )}
        </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-3 p-1"
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

      <div className="flex items-center gap-6 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-medium">Nodes</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{workflow.node_count}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-medium">Edges</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{workflow.edge_count}</p>
        </div>
        <div className="ml-auto">
          <p className="text-sm font-mono text-zinc-400 dark:text-zinc-500">
            {exec ? `$${exec.total_cost.toFixed(4)}` : "$0.0000"}
          </p>
        </div>
      </div>
    </div>
  );
}
