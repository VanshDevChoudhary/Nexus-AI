"use client";

import {
  useCallback,
  useMemo,
  useState,
  useRef,
} from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import AgentNode from "./nodes/AgentNode";
import ToolNode from "./nodes/ToolNode";
import ConditionalNode from "./nodes/ConditionalNode";
import NodePropertiesPanel from "./NodePropertiesPanel";
import type { GraphData, NodeData } from "@/lib/types";

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  conditional: ConditionalNode,
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

let nodeIdCounter = 0;
function generateNodeId(): string {
  nodeIdCounter++;
  return `node_${Date.now()}_${nodeIdCounter}`;
}

function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const defaultNodeData: Record<string, NodeData> = {
  agent: {
    name: "",
    provider: "openai",
    model: "gpt-4o",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 1000,
    max_retries: 2,
    timeout_seconds: 60,
    fallback_agent_id: null,
  },
  tool: {
    name: "",
    provider: "",
    model: "",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 1000,
    max_retries: 0,
    timeout_seconds: 30,
    fallback_agent_id: null,
    tool_type: "",
  },
  conditional: {
    name: "",
    provider: "",
    model: "",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 1000,
    max_retries: 0,
    timeout_seconds: 30,
    fallback_agent_id: null,
    condition: "",
  },
};

interface Props {
  initialData?: GraphData;
  onSave: (data: GraphData) => void;
  saving?: boolean;
}

export default function WorkflowCanvas({ initialData, onSave, saving }: Props) {
  const [nodes, setNodes] = useState<Node<NodeData>[]>(
    initialData?.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })) || [],
  );

  const [edges, setEdges] = useState<Edge[]>(
    initialData?.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: e.data || {},
      animated: true,
      style: { stroke: "#52525b" },
    })) || [],
  );

  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // update selected node if it was moved
      const selectionChange = changes.find(
        (c) => c.type === "select" && c.selected,
      );
      if (selectionChange && "id" in selectionChange) {
        setNodes((nds) => {
          const found = nds.find((n) => n.id === selectionChange.id) || null;
          setSelectedNode(found);
          return nds;
        });
      }
      // deselect
      const deselect = changes.find(
        (c) => c.type === "select" && !c.selected,
      );
      if (deselect && "id" in deselect && deselect.id === selectedNode?.id) {
        // don't deselect if another node is being selected simultaneously
        const anySelected = changes.some(
          (c) => c.type === "select" && c.selected,
        );
        if (!anySelected) setSelectedNode(null);
      }
      // handle delete
      const removeChange = changes.find((c) => c.type === "remove");
      if (removeChange && "id" in removeChange && removeChange.id === selectedNode?.id) {
        setSelectedNode(null);
      }
    },
    [selectedNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: generateEdgeId(),
            animated: true,
            style: { stroke: "#52525b" },
          },
          eds,
        ),
      );
    },
    [],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<NodeData>) => {
      setSelectedNode(node);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeDataChange = useCallback(
    (id: string, updates: Partial<NodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, data: { ...n.data, ...updates } };
          setSelectedNode(updated);
          return updated;
        }),
      );
    },
    [],
  );

  const addNode = useCallback(
    (type: "agent" | "tool" | "conditional") => {
      const viewport = rfInstance.current?.getViewport();
      const x = -(viewport?.x || 0) / (viewport?.zoom || 1) + 300;
      const y = -(viewport?.y || 0) / (viewport?.zoom || 1) + 200;

      const newNode: Node<NodeData> = {
        id: generateNodeId(),
        type,
        position: { x, y },
        data: { ...defaultNodeData[type] },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [],
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => autoLayout(nds, edges));
    setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 50);
  }, [edges]);

  const handleSave = useCallback(() => {
    const graphData: GraphData = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as "agent" | "tool" | "conditional",
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data || null,
      })),
    };
    onSave(graphData);
  }, [nodes, edges, onSave]);

  const nodeTypesMemo = useMemo(() => nodeTypes, []);

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="flex-1 relative">
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <button
            onClick={() => addNode("agent")}
            className="bg-blue-600/90 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm"
          >
            + Agent
          </button>
          <button
            onClick={() => addNode("tool")}
            className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm"
          >
            + Tool
          </button>
          <button
            onClick={() => addNode("conditional")}
            className="bg-orange-600/90 hover:bg-orange-500 text-white px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm"
          >
            + Conditional
          </button>
          <div className="w-px h-5 bg-zinc-700 mx-1" />
          <button
            onClick={handleAutoLayout}
            className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm"
          >
            Auto Layout
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={(instance) => { rfInstance.current = instance; }}
          nodeTypes={nodeTypesMemo}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-zinc-950"
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "#52525b" },
          }}
        >
          <Background color="#27272a" gap={20} />
          <Controls className="!bg-zinc-800 !border-zinc-700 !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700" />
          <MiniMap
            className="!bg-zinc-900 !border-zinc-800"
            nodeColor={(n) => {
              if (n.type === "agent") return "#3b82f6";
              if (n.type === "tool") return "#10b981";
              if (n.type === "conditional") return "#f97316";
              return "#52525b";
            }}
            maskColor="rgba(0, 0, 0, 0.7)"
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodePropertiesPanel
          node={selectedNode}
          onChange={handleNodeDataChange}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
