import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

const providerIcons: Record<string, string> = {
  openai: "O",
  anthropic: "A",
};

function AgentNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`rounded-lg border-2 bg-zinc-900 shadow-lg min-w-[180px] ${
        selected ? "border-blue-400" : "border-blue-600/50"
      }`}
    >
      <div className="bg-blue-600/20 px-3 py-1.5 rounded-t-md flex items-center gap-2">
        <span className="text-xs font-bold text-blue-400 bg-blue-600/30 rounded w-5 h-5 flex items-center justify-center">
          {providerIcons[data.provider] || "?"}
        </span>
        <span className="text-xs font-medium text-blue-300 uppercase tracking-wide">
          Agent
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-zinc-100 truncate">
          {data.name || "Unnamed Agent"}
        </div>
        {data.model && (
          <div className="text-xs text-zinc-500 mt-0.5 truncate">{data.model}</div>
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
