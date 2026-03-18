import { useState, useRef, useEffect, useCallback } from "react";
import { Paper, Textarea, ActionIcon, ScrollArea, Stack, Text, TypographyStylesProvider } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/index";

export function ChatPanel({ cardId, initialQuestion }: { cardId: string; initialQuestion?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialQuestion
      ? [{ role: "assistant", content: `关于这个问题，你有什么想法吗？\n\n> **${initialQuestion}**\n\n你可以尝试用自己的话向我解释，如果不清楚，可以直接告诉我。` }]
      : []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [input, setInput] = useState("");
  const viewport = useRef<HTMLDivElement>(null);

  // 挂载时初始化 review session
  useEffect(() => {
    let cancelled = false;
    fetch("/api/review/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, action: "start" }),
    })
      .then((res) => {
        if (!cancelled && res.ok) setInitialized(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cardId]);

  // 自动滚动到底部
  useEffect(() => {
    requestAnimationFrame(() => {
      if (viewport.current) {
        viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
      }
    });
  }, [messages]);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!initialized || isStreaming) return;

    // 追加用户消息
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);

    // 追加空 AI 消息占位
    setMessages((prev) => [...prev, { role: "assistant", content: "思考中...", isStreaming: true }]);

    try {
      const res = await fetch("/api/review/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, userMessage }),
      });

      if (!res.ok) {
        setMessages((prev) => prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: "抱歉，对话服务暂时不可用。", isStreaming: false } : m
        ));
        setIsStreaming(false);
        return;
      }

      const data = await res.json();
      setMessages((prev) => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, content: data.reply || "...", isStreaming: false } : m
      ));
    } catch (err) {
      setMessages((prev) => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, content: "网络错误，请稍后重试。", isStreaming: false } : m
      ));
    }
    setIsStreaming(false);
  }, [cardId, initialized, isStreaming]);

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      sendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <Stack gap={0} style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
      <ScrollArea flex={1} viewportRef={viewport} type="auto" offsetScrollbars p="md">
        <Stack gap="md">
          {messages.map((m, i) => (
            <Paper
              key={i}
              p="sm"
              px="md"
              radius="lg"
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                background: m.role === 'user' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                border: m.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              <TypographyStylesProvider fz="sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </TypographyStylesProvider>
              {m.isStreaming && (
                <Text span fz="sm" style={{ animation: 'blink 1s step-end infinite' }}>▍</Text>
              )}
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      <div style={{ padding: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)' }}>
        <Textarea
          flex={1}
          size="md"
          radius="md"
          placeholder="尝试用自己的话解释..."
          value={input}
          autosize
          minRows={1}
          maxRows={8}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isStreaming}
          styles={{
            input: {
              background: 'var(--color-bg-tertiary)',
              borderColor: 'var(--color-border)',
            },
          }}
        />
        <ActionIcon
          variant="filled"
          color="brand"
          size="xl"
          radius="md"
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          ↑
        </ActionIcon>
      </div>
    </Stack>
  );
}
