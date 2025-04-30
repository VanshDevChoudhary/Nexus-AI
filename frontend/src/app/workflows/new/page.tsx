"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createWorkflow } from "@/lib/api";
import type { GraphData } from "@/lib/types";
import WorkflowCanvas from "@/components/WorkflowCanvas";

export default function NewWorkflowPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingGraph, setPendingGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback((graphData: GraphData) => {
    setPendingGraph(graphData);
    setShowNameModal(true);
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !pendingGraph) return;

    setSaving(true);
    setError(null);
    try {
      const workflow = await createWorkflow({
        name: name.trim(),
        graph_data: pendingGraph,
      });
      router.push(`/workflows/${workflow.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save workflow";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[calc(100vh-57px)] relative">
      <WorkflowCanvas onSave={handleSave} saving={saving} />

      {showNameModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">
              Name your workflow
            </h2>
            {error && (
              <p className="text-red-400 text-sm mb-3">{error}</p>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 mb-4"
              placeholder="e.g. Research Pipeline"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || saving}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
