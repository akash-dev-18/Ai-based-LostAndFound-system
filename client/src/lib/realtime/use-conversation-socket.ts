import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api/config";
import { queryKeys } from "@/lib/api/query-keys";
import type { Message, MessagePage } from "@/lib/api/types";
import { authStore } from "@/lib/auth/auth-store";

type SocketStatus = "connecting" | "live" | "offline";

function websocketUrl() {
  const base = new URL(API_BASE_URL, window.location.origin);
  const protocol = base.protocol === "https:" ? "wss:" : "ws:";
  const path = `${base.pathname.replace(/\/$/, "")}/ws`;
  return `${protocol}//${base.host}${path}`;
}

export function useConversationSocket(conversationId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let disposed = false;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let attempts = 0;

    const appendMessage = (message: Message) => {
      queryClient.setQueryData<MessagePage>(queryKeys.messages(conversationId), (current) => {
        if (!current) return current;
        if (current.items.some((entry) => entry.id === message.id)) return current;
        return { ...current, items: [...current.items, message] };
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    const connect = () => {
      if (disposed) return;
      const token = authStore.getAccessToken();
      if (!token) {
        setStatus("offline");
        return;
      }
      setStatus("connecting");
      const socket = new WebSocket(websocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        attempts = 0;
        socket.send(JSON.stringify({ type: "auth", token }));
        pingTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25_000);
      };

      socket.onmessage = (event) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = payload.type;
        if (type === "auth.ok") {
          socket.send(JSON.stringify({ type: "subscribe", conversation_id: conversationId }));
          return;
        }
        if (type === "subscribed") {
          setStatus("live");
          return;
        }
        if (type === "chat.message") {
          const message = payload.message as Message | undefined;
          if (message && payload.conversation_id === conversationId) appendMessage(message);
          return;
        }
        if (type === "notification.created") {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          return;
        }
        if (type === "error") {
          const code = payload.code;
          if (code === 401 || code === 403) {
            void authStore.refresh();
          }
        }
      };

      socket.onclose = (event) => {
        window.clearInterval(pingTimer);
        if (disposed) return;
        setStatus("offline");
        if (event.code === 4401) {
          void authStore.refresh();
        }
        attempts += 1;
        const delay = Math.min(1000 * 2 ** attempts, 15_000);
        retryTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      const socket = socketRef.current;
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
      socketRef.current = null;
    };
  }, [conversationId, queryClient]);

  return status;
}
