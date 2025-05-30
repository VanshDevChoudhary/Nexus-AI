"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getWorkflow, updateWorkflow } from "@/lib/api";
import type { GraphData, Workflow } from "@/lib/types";
import WorkflowCanvas from "@/components/WorkflowCanvas";

export default function EditWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkflow(id)
      .then(setWorkflow)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = useCallback(
    async (graphData: GraphData) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await updateWorkflow(id, { graph_data: graphData });
        setWorkflow(updated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to save";
        setError(msg);
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-57px)] gap-3 text-zinc-500">
        <div className="spinner" />
        Loading workflow...
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="text-zinc-400 hover:text-zinc-200 text-sm"
        >
          Back to workflows
        </button>
      </div>
    );
  }

  if (!workflow) return null;

  return (
    <div className="h-[calc(100vh-57px)] relative">
      {/* header bar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-3">
        <span className="text-sm text-zinc-400">{workflow.name}</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      <WorkflowCanvas
        initialData={workflow.graph_data}
        onSave={handleSave}
        saving={saving}
        workflowId={id}
      />
    </div>
  );
}
