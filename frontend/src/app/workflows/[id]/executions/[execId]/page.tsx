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
  completed: { bg: "bg-emerald-100 dark:bg-emerald-900/50", text: "text-emerald-700 dark:text-emerald-300" },
  failed: { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-300" },
  running: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300" },
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900/50", text: "text-yellow-700 dark:text-yellow-300" },
  skipped: { bg: "bg-purple-100 dark:bg-purple-900/50", text: "text-purple-700 dark:text-purple-300" },
  retrying: { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-300" },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainder = secs % 60;
  return `${mins}m ${remainder.toFixed(0)}s`;
}

function getOutputText(agent: AgentExecutionDetail): string {
  if (!agent.output_data) return "";
  const od = agent.output_data as Record<string, unknown>;
  if (typeof od.text === "string") return od.text;
  if (typeof od.error === "string") return od.error;
  return JSON.stringify(od, null, 2);
}

function getInputPrompt(agent: AgentExecutionDetail): string {
  if (!agent.input_data) return "";
  const id = agent.input_data as Record<string, unknown>;
  if (typeof id.prompt === "string") return id.prompt;
  return "";
}

function getSystemPrompt(agent: AgentExecutionDetail): string {
  if (!agent.input_data) return "";
  const id = agent.input_data as Record<string, unknown>;
  if (typeof id.system_prompt === "string") return id.system_prompt;
  return "";
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
        <p className="text-red-600 dark:text-red-400 mb-4">{error || "Execution not found"}</p>
        <button
          onClick={() => router.push(`/workflows/${workflowId}/executions`)}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm"
        >
          Back to executions
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[data.status] || { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" };
  const totalTokens = data.totals.tokens_prompt + data.totals.tokens_completion;
  const hasBacktracking = data.agents.some((a) => a.retries > 0 || a.is_fallback);

  const completedAgents = data.agents.filter((a) => a.status === "completed");
  const finalAgent = completedAgents.length > 0
    ? completedAgents.reduce((a, b) => a.execution_order > b.execution_order ? a : b)
    : null;
  const finalOutput = finalAgent ? getOutputText(finalAgent) : null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/workflows/${workflowId}/executions`)}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12.5 15l-5-5 5-5" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{data.workflow_name}</h1>
              <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                {data.status}
              </span>
            </div>
            <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1 font-mono">{data.id.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Cost" value={`$${data.totals.cost.toFixed(4)}`} />
        <StatCard label="Duration" value={formatDuration(data.totals.duration_ms)} />
        <StatCard label="Tokens" value={totalTokens.toLocaleString()} sub={`${data.totals.tokens_prompt.toLocaleString()} in / ${data.totals.tokens_completion.toLocaleString()} out`} />
        <StatCard label="Agents" value={String(data.agents.length)} />
      </div>

      {finalOutput && <WorkflowOutput agentName={finalAgent!.agent_name} text={finalOutput} />}

      {data.budget && (data.budget.max_cost || data.budget.max_tokens) && (
        <BudgetSection budget={data.budget} totals={data.totals} estimatedCost={data.estimated_cost} />
      )}

      {data.execution_plan?.groups && data.execution_plan.groups.length > 0 && (
        <ExecutionPlan groups={data.execution_plan.groups} agents={data.agents} />
      )}

      {hasBacktracking && <BacktrackingSection agents={data.agents} />}

      <AgentBreakdownTable agents={data.agents} />
    </div>
  );
}

function WorkflowOutput({ agentName, text }: { agentName: string; text: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Workflow Output</h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">from {agentName}</span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-zinc-400 dark:text-zinc-500 text-xs mb-1">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5">{sub}</p>}
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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">Budget vs Actual</h2>
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
            <p className="text-zinc-400 dark:text-zinc-500 text-xs mb-1">Estimated Cost</p>
            <p className="text-zinc-700 dark:text-zinc-300 font-mono">${estimatedCost.toFixed(4)}</p>
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
        <span className="text-zinc-400 dark:text-zinc-500">{label}</span>
        <span className={overBudget ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-1.5">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{actual} used</span>
        <span className="text-zinc-400 dark:text-zinc-600">{budget} budget</span>
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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">Execution Plan</h2>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.group} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400 font-mono shrink-0 mt-0.5">
              {g.group}
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {g.agents.map((planAgent: ExecutionPlanAgent) => {
                const agent = agentMap.get(planAgent.node_id);
                const agentBadge = agent
                  ? STATUS_BADGE[agent.status] || { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" }
                  : { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500" };
                return (
                  <span
                    key={planAgent.node_id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${agentBadge.bg} ${agentBadge.text} border border-zinc-200/50 dark:border-zinc-800/50`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      agent?.status === "completed" ? "bg-emerald-400" :
                      agent?.status === "failed" ? "bg-red-400" :
                      agent?.status === "skipped" ? "bg-purple-400" :
                      "bg-zinc-400 dark:bg-zinc-600"
                    }`} />
                    {agent?.agent_name || planAgent.node_id}
                  </span>
                );
              })}
            </div>
            {g.agents.length > 1 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0 mt-1.5">parallel</span>
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
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">Backtracking</h2>
      <div className="space-y-2 text-xs">
        {retried.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <span className="text-amber-600 dark:text-amber-400 font-mono">retry</span>
            <span className="font-medium">{a.agent_name}</span>
            <span className="text-zinc-500">
              retried {a.retries}x — {a.status === "completed" ? "succeeded" : a.status}
            </span>
          </div>
        ))}
        {fallbacks.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <span className="text-purple-600 dark:text-purple-400 font-mono">fallback</span>
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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Agent Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wider">
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
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {agents.map((agent) => {
              const isExpanded = expandedId === agent.id;
              const badge = STATUS_BADGE[agent.status] || { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" };
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
  const outputText = getOutputText(agent);
  const preview = outputText.length > 80 ? outputText.slice(0, 80) + "..." : outputText;

  return (
    <>
      <tr
        className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-4 py-2.5">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{agent.agent_name}</span>
              {agent.is_fallback && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                  fallback
                </span>
              )}
            </div>
            {!isExpanded && preview && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-xs">{preview}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 text-xs font-mono">
          {agent.model_used}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
          {agent.tokens_prompt.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
          {agent.tokens_completion.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">
          ${agent.cost.toFixed(4)}
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
          {formatDuration(agent.latency_ms)}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
            {agent.status}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
          {agent.retries > 0 ? agent.retries : "\u2014"}
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
              className={`text-zinc-400 dark:text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            >
              <path d="M3.5 5.25L7 8.75l3.5-3.5" />
            </svg>
          )}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={9} className="px-4 py-4 bg-zinc-50/80 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800/50">
            <div className="space-y-4 max-w-4xl">
              <AgentDetailSection agent={agent} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AgentDetailSection({ agent }: { agent: AgentExecutionDetail }) {
  const systemPrompt = getSystemPrompt(agent);
  const inputPrompt = getInputPrompt(agent);
  const outputText = getOutputText(agent);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        {systemPrompt && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">System Prompt</p>
            </div>
            <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40 rounded-md px-3 py-2.5">
              <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">{systemPrompt}</p>
            </div>
          </div>
        )}

        {inputPrompt && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Input</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-md px-3 py-2.5">
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed whitespace-pre-wrap">{inputPrompt}</p>
            </div>
          </div>
        )}
      </div>

      <div>
        {outputText && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Output</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-md px-3 py-2.5">
              <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed whitespace-pre-wrap">{outputText}</p>
            </div>
          </div>
        )}

        {agent.status === "failed" && !outputText && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Error</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-md px-3 py-2.5">
              <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-mono">Agent execution failed</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
