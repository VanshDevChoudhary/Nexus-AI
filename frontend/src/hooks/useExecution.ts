"use client";

import { useCallback, useMemo, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { getExecution } from "@/lib/api";
import type {
  AgentNodeStatus,
  ExecutionDetailResponse,
  ExecutionTotals,
  WsEvent,
} from "@/lib/types";

export interface NodeStatus {
  status: AgentNodeStatus;
  cost?: number;
  latencyMs?: number;
  error?: string;
  retryNumber?: number;
}

interface UseExecutionReturn {
  nodeStatuses: Record<string, NodeStatus>;
  executionStatus: string | null;
  totals: ExecutionTotals | null;
  isRunning: boolean;
  isConnected: boolean;
  events: WsEvent[];
  startExecution: (executionId: string) => void;
  stopListening: () => void;
  syncFromRest: (executionId: string) => Promise<void>;
}

export function useExecution(): UseExecutionReturn {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [totals, setTotals] = useState<ExecutionTotals | null>(null);

  const handleEvent = useCallback((event: WsEvent) => {
    switch (event.type) {
      case "agent_started":
        setNodeStatuses((prev) => ({
          ...prev,
          [event.agent_id]: { status: "running" },
        }));
        break;

      case "agent_completed":
        setNodeStatuses((prev) => ({
          ...prev,
          [event.agent_id]: {
            status: "completed",
            cost: event.cost,
            latencyMs: event.latency_ms,
          },
        }));
        break;

      case "agent_failed":
        if (event.will_retry) {
          // will transition to retrying next
          setNodeStatuses((prev) => ({
            ...prev,
            [event.agent_id]: {
              status: "failed",
              error: event.error,
            },
          }));
        } else {
          setNodeStatuses((prev) => ({
            ...prev,
            [event.agent_id]: {
              status: "failed",
              error: event.error,
            },
          }));
        }
        break;

      case "agent_retrying":
        setNodeStatuses((prev) => ({
          ...prev,
          [event.agent_id]: {
            status: "retrying",
            retryNumber: event.retry_number,
          },
        }));
        break;

      case "agent_fallback":
        // original stays failed, fallback starts
        setNodeStatuses((prev) => ({
          ...prev,
          [event.fallback_agent_id]: { status: "running" },
        }));
        break;

      case "agent_skipped":
        setNodeStatuses((prev) => ({
          ...prev,
          [event.agent_id]: {
            status: "skipped",
            error: event.reason,
          },
        }));
        break;

      case "execution_completed":
        setExecutionStatus(event.status);
        setTotals(event.totals);
        break;
    }
  }, []);

  const { events, isConnected } = useWebSocket(executionId, handleEvent);

  const isRunning = useMemo(
    () => executionId !== null && executionStatus === null,
    [executionId, executionStatus],
  );

  const startExecution = useCallback((eid: string) => {
    setNodeStatuses({});
    setExecutionStatus(null);
    setTotals(null);
    setExecutionId(eid);
  }, []);

  const stopListening = useCallback(() => {
    setExecutionId(null);
  }, []);

  const syncFromRest = useCallback(async (eid: string) => {
    try {
      const detail: ExecutionDetailResponse = await getExecution(eid);
      setExecutionStatus(detail.status);

      const statuses: Record<string, NodeStatus> = {};
      for (const agent of detail.agents) {
        statuses[agent.agent_node_id] = {
          status: agent.status as AgentNodeStatus,
          cost: agent.cost,
          latencyMs: agent.latency_ms ?? undefined,
        };
      }
      setNodeStatuses(statuses);

      if (detail.totals) {
        setTotals({
          tokens_prompt: detail.totals.tokens_prompt,
          tokens_completion: detail.totals.tokens_completion,
          cost: detail.totals.cost,
          duration_ms: detail.totals.duration_ms ?? 0,
          agents_completed: detail.agents.filter((a) => a.status === "completed").length,
          agents_failed: detail.agents.filter((a) => a.status === "failed").length,
          agents_skipped: detail.agents.filter((a) => a.status === "skipped").length,
        });
      }
    } catch {
      // REST sync failed, keep current state
    }
  }, []);

  return {
    nodeStatuses,
    executionStatus,
    totals,
    isRunning,
    isConnected,
    events,
    startExecution,
    stopListening,
    syncFromRest,
  };
}
