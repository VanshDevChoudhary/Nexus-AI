import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { AgentNodeStatus } from "@/lib/types";

const providerIcons: Record<string, string> = {
  openai: "O",
  anthropic: "A",
};

const statusBorder: Record<AgentNodeStatus, string> = {
  pending: "border-zinc-600/50",
  running: "border-blue-400 shadow-blue-500/20 shadow-lg",
  completed: "border-emerald-400",
  failed: "border-red-400",
  retrying: "border-yellow-400",
  skipped: "border-purple-400/60 opacity-60",
};

function StatusDot({ status }: { status: AgentNodeStatus }) {
  const colors: Record<AgentNodeStatus, string> = {
    pending: "",
    running: "bg-blue-400 animate-ping",
    completed: "bg-emerald-400",
    failed: "bg-red-400",
    retrying: "bg-yellow-400 animate-ping",
    skipped: "bg-purple-400",
  };
  if (status === "pending") return null;
  return <span className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

function AgentNode({ data, selected }: NodeProps) {
  const execStatus = data._executionStatus as AgentNodeStatus | undefined;
  const inExec = !!execStatus;

  const border = inExec
    ? statusBorder[execStatus]
    : selected ? "border-blue-400" : "border-blue-600/50";

  return (
    <div
      className={`rounded-lg border-2 bg-zinc-900 shadow-lg min-w-[180px] ${border} ${
        execStatus === "running" ? "animate-pulse" : ""
      }`}
    >
      <div className="bg-blue-600/20 px-3 py-1.5 rounded-t-md flex items-center gap-2">
        <span className="text-xs font-bold text-blue-400 bg-blue-600/30 rounded w-5 h-5 flex items-center justify-center">
          {providerIcons[data.provider] || "?"}
        </span>
        <span className="text-xs font-medium text-blue-300 uppercase tracking-wide flex-1">
          Agent
        </span>
        {execStatus && <StatusDot status={execStatus} />}
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-zinc-100 truncate">
          {data.name || "Unnamed Agent"}
        </div>
        {data.model && (
          <div className="text-xs text-zinc-500 mt-0.5 truncate">{data.model}</div>
        )}
        {execStatus === "running" && (
          <div className="text-[10px] text-blue-300 mt-1">Running...</div>
        )}
        {execStatus === "retrying" && (
          <div className="text-[10px] text-yellow-300 mt-1">Retrying...</div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
    </div>
  );
}

export default memo(AgentNode);
