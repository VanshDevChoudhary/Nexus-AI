import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

function ToolNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`rounded-lg border-2 bg-zinc-900 shadow-lg min-w-[180px] ${
        selected ? "border-emerald-400" : "border-emerald-600/50"
      }`}
    >
      <div className="bg-emerald-600/20 px-3 py-1.5 rounded-t-md flex items-center gap-2">
        <span className="text-xs font-bold text-emerald-400 bg-emerald-600/30 rounded w-5 h-5 flex items-center justify-center">
          T
        </span>
        <span className="text-xs font-medium text-emerald-300 uppercase tracking-wide">
          Tool
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-zinc-100 truncate">
          {data.name || "Unnamed Tool"}
        </div>
        {data.tool_type && (
          <div className="text-xs text-zinc-500 mt-0.5">{data.tool_type}</div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
    </div>
  );
}

export default memo(ToolNode);
