"use client";

import { useCallback, useState } from "react";
import type { ExecuteBudget } from "@/lib/types";

interface Props {
  onConfirm: (budget: ExecuteBudget, inputData?: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function BudgetConfigModal({ onConfirm, onCancel }: Props) {
  const [maxTokens, setMaxTokens] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const handleSubmit = useCallback(() => {
    const budget: ExecuteBudget = {};
    if (maxTokens) budget.max_tokens = parseInt(maxTokens, 10);
    if (maxCost) budget.max_cost = parseFloat(maxCost);

    const inputData = userQuery.trim()
      ? { user_query: userQuery.trim() }
      : undefined;

    onConfirm(budget, inputData);
  }, [maxTokens, maxCost, userQuery, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Run Workflow</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">User Input (optional)</label>
            <textarea
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Provide initial context for the workflow..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="No limit"
                min={0}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Max Cost ($)</label>
              <input
                type="number"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder="No limit"
                min={0}
                step={0.01}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}
