"use client";

import { useMemo } from "react";
import type { NodeStatus } from "@/hooks/useExecution";
import type { ExecutionTotals } from "@/lib/types";

interface Props {
  nodeStatuses: Record<string, NodeStatus>;
  executionStatus: string | null;
  totals: ExecutionTotals | null;
  isRunning: boolean;
  isConnected: boolean;
  onClose: () => void;
}

export default function ExecutionViewer({
  nodeStatuses,
  executionStatus,
  totals,
  isRunning,
  isConnected,
  onClose,
}: Props) {
  const liveCost = useMemo(() => {
    let cost = 0;
    for (const ns of Object.values(nodeStatuses)) {
      cost += ns.cost ?? 0;
    }
    return cost;
  }, [nodeStatuses]);

  const counts = useMemo(() => {
    let running = 0;
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    for (const ns of Object.values(nodeStatuses)) {
      if (ns.status === "running" || ns.status === "retrying") running++;
      else if (ns.status === "completed") completed++;
      else if (ns.status === "failed") failed++;
      else if (ns.status === "skipped") skipped++;
    }
    return { running, completed, failed, skipped };
  }, [nodeStatuses]);

  const isDone = executionStatus === "completed" || executionStatus === "failed";

  return (
    <>
      {/* Live status bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-zinc-900/95 border border-zinc-700 rounded-lg px-4 py-2.5 shadow-xl backdrop-blur-sm">
        {/* Connection indicator */}
        <span
          className={`w-2 h-2 rounded-full ${
            isConnected ? "bg-emerald-400" : "bg-red-400"
          }`}
          title={isConnected ? "Connected" : "Disconnected"}
        />

        {isRunning && (
          <>
            <span className="text-xs text-zinc-400">
              {counts.running > 0 && (
                <span className="text-blue-300">{counts.running} running</span>
              )}
            </span>
            <span className="w-px h-4 bg-zinc-700" />
            <span className="text-xs text-zinc-400">
              {counts.completed} done
            </span>
            <span className="w-px h-4 bg-zinc-700" />
            <span className="text-xs font-mono text-emerald-300">
              ${liveCost.toFixed(4)}
            </span>
          </>
        )}

        {isDone && (
          <>
            <span className={`text-xs font-medium ${
              executionStatus === "completed" ? "text-emerald-300" : "text-red-300"
            }`}>
              {executionStatus === "completed" ? "Completed" : "Failed"}
            </span>
            <span className="w-px h-4 bg-zinc-700" />
            <span className="text-xs font-mono text-emerald-300">
              ${(totals?.cost ?? liveCost).toFixed(4)}
            </span>
            {totals?.duration_ms !== undefined && (
              <>
                <span className="w-px h-4 bg-zinc-700" />
                <span className="text-xs text-zinc-400">
                  {(totals.duration_ms / 1000).toFixed(1)}s
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Completion summary toast */}
      {isDone && (
        <div className="absolute top-16 right-4 z-20 bg-zinc-900/95 border border-zinc-700 rounded-lg p-4 shadow-xl backdrop-blur-sm max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-semibold ${
              executionStatus === "completed" ? "text-emerald-300" : "text-red-300"
            }`}>
              Execution {executionStatus}
            </h3>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              Dismiss
            </button>
          </div>
          {totals && (
            <div className="space-y-1 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Cost</span>
                <span className="text-emerald-300 font-mono">${totals.cost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration</span>
                <span>{(totals.duration_ms / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span>Tokens</span>
                <span>{(totals.tokens_prompt + totals.tokens_completion).toLocaleString()}</span>
              </div>
              <div className="flex gap-3 mt-1.5 pt-1.5 border-t border-zinc-800">
                <span className="text-emerald-400">{totals.agents_completed} passed</span>
                {totals.agents_failed > 0 && (
                  <span className="text-red-400">{totals.agents_failed} failed</span>
                )}
                {totals.agents_skipped > 0 && (
                  <span className="text-purple-400">{totals.agents_skipped} skipped</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
