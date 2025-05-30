"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getExecution } from "@/lib/api";
import type {
  AgentExecutionDetail,
  ExecutionDetailResponse,
  ExecutionPlanAgent,
  ExecutionPlanGroup,
} from "@/lib/types";

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-emerald-900/50", text: "text-emerald-300" },
  failed: { bg: "bg-red-900/50", text: "text-red-300" },
  running: { bg: "bg-blue-900/50", text: "text-blue-300" },
  pending: { bg: "bg-yellow-900/50", text: "text-yellow-300" },
  skipped: { bg: "bg-purple-900/50", text: "text-purple-300" },
  retrying: { bg: "bg-amber-900/50", text: "text-amber-300" },
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

export default function ExecutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const execId = params.execId as string;

  const [data, setData] = useState<ExecutionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getExecution(execId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [execId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-57px)] gap-3 text-zinc-500">
        <div className="spinner" />
        Loading execution...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-red-400 mb-4">{error || "Execution not found"}</p>
        <button
          onClick={() => router.push(`/workflows/${workflowId}/executions`)}
          className="text-zinc-400 hover:text-zinc-200 text-sm"
        >
          Back to executions
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[data.status] || { bg: "bg-zinc-800", text: "text-zinc-400" };
  const totalTokens = data.totals.tokens_prompt + data.totals.tokens_completion;
  const hasBacktracking = data.agents.some((a) => a.retries > 0 || a.is_fallback);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/workflows/${workflowId}/executions`)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12.5 15l-5-5 5-5" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{data.workflow_name}</h1>
              <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                {data.status}
              </span>
            </div>
            <p className="text-zinc-500 text-xs mt-1 font-mono">{data.id.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Cost" value={`$${data.totals.cost.toFixed(4)}`} />
        <StatCard label="Duration" value={formatDuration(data.totals.duration_ms)} />
        <StatCard label="Tokens" value={totalTokens.toLocaleString()} sub={`${data.totals.tokens_prompt.toLocaleString()} in / ${data.totals.tokens_completion.toLocaleString()} out`} />
        <StatCard label="Agents" value={String(data.agents.length)} />
      </div>

      {/* Budget comparison */}
      {data.budget && (data.budget.max_cost || data.budget.max_tokens) && (
        <BudgetSection budget={data.budget} totals={data.totals} estimatedCost={data.estimated_cost} />
      )}

      {/* Execution plan */}
      {data.execution_plan?.groups && data.execution_plan.groups.length > 0 && (
        <ExecutionPlan groups={data.execution_plan.groups} agents={data.agents} />
      )}

      {/* Backtracking summary */}
      {hasBacktracking && <BacktrackingSection agents={data.agents} />}

      {/* Per-agent breakdown */}
      <AgentBreakdownTable agents={data.agents} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function BudgetSection({
  budget,
  totals,
  estimatedCost,
}: {
  budget: { max_cost?: number | null; max_tokens?: number | null };
  totals: { cost: number; tokens_prompt: number; tokens_completion: number };
  estimatedCost: number | null;
}) {
  const totalTokens = totals.tokens_prompt + totals.tokens_completion;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-200 mb-3">Budget vs Actual</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        {budget.max_cost != null && (
          <BudgetRow
            label="Cost"
            budget={`$${budget.max_cost.toFixed(2)}`}
            actual={`$${totals.cost.toFixed(4)}`}
            percentage={(totals.cost / budget.max_cost) * 100}
          />
        )}
        {budget.max_tokens != null && (
          <BudgetRow
            label="Tokens"
            budget={budget.max_tokens.toLocaleString()}
            actual={totalTokens.toLocaleString()}
            percentage={(totalTokens / budget.max_tokens) * 100}
          />
        )}
        {estimatedCost != null && (
          <div>
            <p className="text-zinc-500 text-xs mb-1">Estimated Cost</p>
            <p className="text-zinc-300 font-mono">${estimatedCost.toFixed(4)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetRow({
  label,
  budget,
  actual,
  percentage,
}: {
  label: string;
  budget: string;
  actual: string;
  percentage: number;
}) {
  const overBudget = percentage > 100;
  const barWidth = Math.min(percentage, 100);
  const barColor = overBudget
    ? "bg-red-500"
    : percentage > 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className={overBudget ? "text-red-400" : "text-zinc-400"}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full mb-1.5">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{actual} used</span>
        <span className="text-zinc-600">{budget} budget</span>
      </div>
    </div>
  );
}

function ExecutionPlan({
  groups,
  agents,
}: {
  groups: ExecutionPlanGroup[];
  agents: AgentExecutionDetail[];
}) {
  const agentMap = new Map(agents.map((a) => [a.agent_node_id, a]));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-200 mb-3">Execution Plan</h2>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.group} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 font-mono shrink-0 mt-0.5">
              {g.group}
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {g.agents.map((planAgent: ExecutionPlanAgent) => {
                const agent = agentMap.get(planAgent.node_id);
                const agentBadge = agent
                  ? STATUS_BADGE[agent.status] || { bg: "bg-zinc-800", text: "text-zinc-400" }
                  : { bg: "bg-zinc-800", text: "text-zinc-500" };
                return (
                  <span
                    key={planAgent.node_id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${agentBadge.bg} ${agentBadge.text} border border-zinc-800/50`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      agent?.status === "completed" ? "bg-emerald-400" :
                      agent?.status === "failed" ? "bg-red-400" :
                      agent?.status === "skipped" ? "bg-purple-400" :
                      "bg-zinc-600"
                    }`} />
                    {agent?.agent_name || planAgent.node_id}
                  </span>
                );
              })}
            </div>
            {g.agents.length > 1 && (
              <span className="text-[10px] text-zinc-600 shrink-0 mt-1.5">parallel</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BacktrackingSection({ agents }: { agents: AgentExecutionDetail[] }) {
  const retried = agents.filter((a) => a.retries > 0);
  const fallbacks = agents.filter((a) => a.is_fallback);

  return (
    <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-amber-300 mb-2">Backtracking</h2>
      <div className="space-y-2 text-xs">
        {retried.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-zinc-300">
            <span className="text-amber-400 font-mono">retry</span>
            <span className="font-medium">{a.agent_name}</span>
            <span className="text-zinc-500">
              retried {a.retries}x — {a.status === "completed" ? "succeeded" : a.status}
            </span>
          </div>
        ))}
        {fallbacks.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-zinc-300">
            <span className="text-purple-400 font-mono">fallback</span>
            <span className="font-medium">{a.agent_name}</span>
            <span className="text-zinc-500">
              ran as fallback — {a.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentBreakdownTable({ agents }: { agents: AgentExecutionDetail[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Agent Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">Agent</th>
              <th className="text-left px-4 py-2.5 font-medium">Model</th>
              <th className="text-right px-4 py-2.5 font-medium">Prompt</th>
              <th className="text-right px-4 py-2.5 font-medium">Completion</th>
              <th className="text-right px-4 py-2.5 font-medium">Cost</th>
              <th className="text-right px-4 py-2.5 font-medium">Latency</th>
              <th className="text-center px-4 py-2.5 font-medium">Status</th>
              <th className="text-right px-4 py-2.5 font-medium">Retries</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {agents.map((agent) => {
              const isExpanded = expandedId === agent.id;
              const badge = STATUS_BADGE[agent.status] || { bg: "bg-zinc-800", text: "text-zinc-400" };
              return (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  badge={badge}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : agent.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  badge,
  isExpanded,
  onToggle,
}: {
  agent: AgentExecutionDetail;
  badge: { bg: string; text: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = agent.input_data || agent.output_data;

  return (
    <>
      <tr
        className={`hover:bg-zinc-800/40 transition-colors ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-zinc-200 font-medium">{agent.agent_name}</span>
            {agent.is_fallback && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">
                fallback
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono">
          {agent.model_used}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-400">
          {agent.tokens_prompt.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-400">
          {agent.tokens_completion.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-zinc-300">
          ${agent.cost.toFixed(4)}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-400">
          {formatDuration(agent.latency_ms)}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
            {agent.status}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-400">
          {agent.retries > 0 ? agent.retries : "—"}
        </td>
        <td className="px-2 py-2.5">
          {hasDetails && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            >
              <path d="M3.5 5.25L7 8.75l3.5-3.5" />
            </svg>
          )}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={9} className="px-4 py-3 bg-zinc-950/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agent.input_data && (
                <JsonBlock label="Input" data={agent.input_data} />
              )}
              {agent.output_data && (
                <JsonBlock label="Output" data={agent.output_data} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <pre className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded p-3 overflow-auto max-h-48 font-mono leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
