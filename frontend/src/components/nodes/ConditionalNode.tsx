import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

function ConditionalNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`rounded-lg border-2 bg-zinc-900 shadow-lg min-w-[180px] ${
        selected ? "border-orange-400" : "border-orange-600/50"
      }`}
    >
      <div className="bg-orange-600/20 px-3 py-1.5 rounded-t-md flex items-center gap-2">
        <span className="text-xs font-bold text-orange-400 bg-orange-600/30 rounded w-5 h-5 flex items-center justify-center">
          ?
        </span>
        <span className="text-xs font-medium text-orange-300 uppercase tracking-wide">
          Conditional
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-zinc-100 truncate">
          {data.name || "Unnamed Condition"}
        </div>
        {data.condition && (
          <div className="text-xs text-zinc-500 mt-0.5 truncate">
            {data.condition}
          </div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-500 !w-3 !h-3 !border-2 !border-zinc-900"
      />
    </div>
  );
}

export default memo(ConditionalNode);
