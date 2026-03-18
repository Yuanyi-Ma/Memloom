import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "../types/index";
import { api } from "../services/api";

interface GatewayWSOptions {
  sessionKey: string;
  cardContext?: { detail: string; feynman_seed: string };
}

/**
 * 生成唯一请求 ID
 */
function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 通过 OpenClaw Gateway WS 与 Agent 对话的 Hook。
 * 遵循 Gateway Protocol: https://docs.openclaw.ai/gateway/protocol
 *
 * 握手流程：
 *   1. 服务端发 connect.challenge {nonce, ts}
 *   2. 客户端发 {type:"req", method:"connect", params:{auth:{token}, client:{...}, role:"operator"}}
 *   3. 服务端返回 {type:"res", ok:true, payload:{type:"hello-ok"}}
 */
export function useGatewayChat(options: GatewayWSOptions, initialQuestion?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialQuestion
      ? [{ role: "assistant", content: `关于这个问题，你有什么想法吗？\n\n> **${initialQuestion}**\n\n你可以尝试用自己的话向我解释。` }]
      : []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const connectIdRef = useRef<string>("");

  // 建立 Gateway WS 连接
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { token, port } = await api.getGatewayToken();
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // Step 1: 收到 connect.challenge，发送 connect 请求
            if (msg.type === "event" && msg.event === "connect.challenge") {
              connectIdRef.current = genId();
              ws.send(JSON.stringify({
                type: "req",
                id: connectIdRef.current,
                method: "connect",
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: { id: "memloom-web", version: "2.0.0", platform: "web", mode: "operator" },
                  role: "operator",
                  scopes: ["operator.read", "operator.write"],
                  caps: [],
                  commands: [],
                  permissions: {},
                  auth: { token },
                  userAgent: "memloom-web/2.0.0",
                },
              }));
            }

            // Step 2: 收到 hello-ok = 认证成功
            if (msg.type === "res" && msg.id === connectIdRef.current && msg.ok) {
              if (!cancelled) setConnected(true);
            }

            // Agent 流式事件（文本 delta）
            if (msg.type === "event" && msg.event === "agent.text") {
              const content = msg.payload?.text || "";
              if (content) {
                setMessages(prev => prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: m.content + content } : m
                ));
              }
            }

            // Agent RPC 响应完成
            if (msg.type === "res" && msg.ok && msg.payload?.type === "agent-complete") {
              setIsStreaming(false);
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, isStreaming: false } : m
              ));
            }
          } catch { /* ignore */ }
        };

        ws.onerror = () => { if (!cancelled) setConnected(false); };
        ws.onclose = () => { if (!cancelled) setConnected(false); };
      } catch (err) {
        console.error("[Memloom] Gateway WS connection failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [options.sessionKey]);

  const sendMessage = useCallback((userMessage: string) => {
    if (!wsRef.current || !connected) return;

    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);
    setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

    // 发送 agent RPC（Gateway Protocol 帧格式）
    wsRef.current.send(JSON.stringify({
      type: "req",
      id: genId(),
      method: "agent",
      params: {
        message: userMessage,
        sessionKey: options.sessionKey,
      },
    }));
  }, [connected, options.sessionKey]);

  return { messages, sendMessage, isStreaming, connected };
}
