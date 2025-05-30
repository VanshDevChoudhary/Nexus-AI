"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsEvent } from "@/lib/types";
import { getExecution } from "@/lib/api";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const MAX_BACKOFF = 30_000;

interface UseWebSocketReturn {
  events: WsEvent[];
  lastEvent: WsEvent | null;
  isConnected: boolean;
}

export function useWebSocket(
  executionId: string | null,
  onEvent?: (event: WsEvent) => void,
): UseWebSocketReturn {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(
    (eid: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(`${WS_BASE}/ws/executions/${eid}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retriesRef.current = 0;
      };

      ws.onmessage = (msg) => {
        try {
          const event: WsEvent = JSON.parse(msg.data);
          setEvents((prev) => [...prev, event]);
          setLastEvent(event);
          onEventRef.current?.(event);
        } catch {
          // bad message, ignore
        }
      };

      ws.onclose = (e) => {
        setIsConnected(false);
        wsRef.current = null;

        // TODO: surface close reason in the execution viewer UI
        if (e.code === 1000 || e.code === 4004) return;

        // reconnect with exponential backoff
        const delay = Math.min(1000 * 2 ** retriesRef.current, MAX_BACKOFF);
        retriesRef.current++;

        // fetch current state on disconnect
        getExecution(eid).catch(() => {});

        reconnectTimerRef.current = setTimeout(() => {
          connect(eid);
        }, delay);
      };

      ws.onerror = () => {
        // onclose handles reconnection
      };
    },
    [],
  );

  useEffect(() => {
    if (!executionId) return;

    setEvents([]);
    setLastEvent(null);
    retriesRef.current = 0;

    connect(executionId);

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [executionId, connect]);

  return { events, lastEvent, isConnected };
}
