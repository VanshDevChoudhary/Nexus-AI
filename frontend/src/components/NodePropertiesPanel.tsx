import { useCallback } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "@/lib/types";

const PROVIDERS = ["openai", "anthropic"] as const;
const MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
  anthropic: ["claude-3.5-sonnet", "claude-3-haiku"],
};

interface Props {
  node: Node<NodeData>;
  onChange: (id: string, data: Partial<NodeData>) => void;
  onClose: () => void;
}

export default function NodePropertiesPanel({ node, onChange, onClose }: Props) {
  const { data, type } = node;

  const update = useCallback(
    (field: string, value: unknown) => {
      onChange(node.id, { [field]: value });
    },
    [node.id, onChange],
  );

  const models = MODELS[data.provider] || [];

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200">
          {type === "agent" ? "Agent" : type === "tool" ? "Tool" : "Conditional"} Properties
        </h3>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      <div className="p-4 space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={data.name || ""}
            onChange={(e) => update("name", e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="Node name"
          />
        </Field>

        {type === "agent" && (
          <>
            <Field label="Provider">
              <select
                value={data.provider || ""}
                onChange={(e) => {
                  const provider = e.target.value;
                  const defaultModel = MODELS[provider]?.[0] || "";
                  onChange(node.id, { provider, model: defaultModel });
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              >
                <option value="">Select provider</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>

            <Field label="Model">
              <select
                value={data.model || ""}
                onChange={(e) => update("model", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                disabled={!data.provider}
              >
                <option value="">Select model</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>

            <Field label="System Prompt">
              <textarea
                value={data.system_prompt || ""}
                onChange={(e) => update("system_prompt", e.target.value)}
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-y"
                placeholder="Instructions for the agent..."
              />
            </Field>

            <Field label={`Temperature: ${data.temperature ?? 0.7}`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={data.temperature ?? 0.7}
                onChange={(e) => update("temperature", parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </Field>

            <Field label="Max Tokens">
              <input
                type="number"
                value={data.max_tokens ?? 1000}
                onChange={(e) => update("max_tokens", parseInt(e.target.value) || 1000)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                min={1}
                max={128000}
              />
            </Field>

            <Field label="Max Retries">
              <input
                type="number"
                value={data.max_retries ?? 2}
                onChange={(e) => update("max_retries", parseInt(e.target.value) || 0)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                min={0}
                max={5}
              />
            </Field>

            <Field label="Timeout (seconds)">
              <input
                type="number"
                value={data.timeout_seconds ?? 60}
                onChange={(e) => update("timeout_seconds", parseInt(e.target.value) || 60)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                min={5}
                max={300}
              />
            </Field>

            <div className="pt-2 border-t border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Memory</p>

              <div className="space-y-4">
                <Field label="Store Key">
                  <input
                    type="text"
                    value={data.memory_store_key || ""}
                    onChange={(e) => update("memory_store_key", e.target.value || null)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    placeholder="e.g. research_findings"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Save output to memory with this key</p>
                </Field>

                <Field label="Recall Query">
                  <input
                    type="text"
                    value={data.memory_recall_query || ""}
                    onChange={(e) => update("memory_recall_query", e.target.value || null)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    placeholder="e.g. previous research"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Search memory before execution</p>
                </Field>
              </div>
            </div>
          </>
        )}

        {type === "tool" && (
          <Field label="Tool Type">
            <input
              type="text"
              value={data.tool_type || ""}
              onChange={(e) => update("tool_type", e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              placeholder="e.g. web_search, calculator"
            />
          </Field>
        )}

        {type === "conditional" && (
          <Field label="Condition Expression">
            <textarea
              value={data.condition || ""}
              onChange={(e) => update("condition", e.target.value)}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-y"
              placeholder='e.g. output.sentiment == "positive"'
            />
          </Field>
        )}

        <div className="pt-2 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600">ID: {node.id}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
