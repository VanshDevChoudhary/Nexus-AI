"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { listExecutions, getWorkflow } from "@/lib/api";
import type { ExecutionListItem } from "@/lib/types";

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-emerald-900/50", text: "text-emerald-300" },
  failed: { bg: "bg-red-900/50", text: "text-red-300" },
  running: { bg: "bg-blue-900/50", text: "text-blue-300" },
  pending: { bg: "bg-yellow-900/50", text: "text-yellow-300" },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainder = secs % 60;
  return `${mins}m ${remainder.toFixed(0)}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 15;

export default function ExecutionHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState<string>("");

  const load = useCallback(
    (pageNum: number) => {
      setLoading(true);
      setError(null);
      listExecutions(workflowId, pageNum * PAGE_SIZE, PAGE_SIZE)
        .then((res) => {
          setExecutions(res.data);
          setTotal(res.total);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [workflowId],
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  useEffect(() => {
    getWorkflow(workflowId)
      .then((w) => setWorkflowName(w.name))
      .catch(() => {});
  }, [workflowId]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/workflows/${workflowId}`)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12.5 15l-5-5 5-5" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Execution History</h1>
          {workflowName && (
            <p className="text-zinc-500 text-sm">{workflowName}</p>
          )}
        </div>
        <span className="text-zinc-600 text-sm ml-auto">
          {total} execution{total !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-md px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {loading && executions.length === 0 && (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading...</div>
      )}

      {!loading && executions.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg mb-2">No executions yet</p>
          <p className="text-sm">Run this workflow to see execution history here.</p>
        </div>
      )}

      {executions.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900/80 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Cost</th>
                <th className="text-right px-4 py-3 font-medium">Tokens</th>
                <th className="text-right px-4 py-3 font-medium">Agents</th>
                <th className="text-right px-4 py-3 font-medium">Duration</th>
                <th className="text-right px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {executions.map((exec) => {
                const badge = STATUS_BADGE[exec.status] || {
                  bg: "bg-zinc-800",
                  text: "text-zinc-400",
                };
                return (
                  <tr
                    key={exec.id}
                    onClick={() =>
                      router.push(
                        `/workflows/${workflowId}/executions/${exec.id}`,
                      )
                    }
                    className="hover:bg-zinc-900/60 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {exec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      ${exec.total_cost.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {exec.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {exec.agent_count}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {formatDuration(exec.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {formatDate(exec.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
