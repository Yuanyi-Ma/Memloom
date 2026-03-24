import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/index";
import { ArrowUp } from "lucide-react";

export function ChatPanel({ cardId, initialQuestion }: { cardId: string; initialQuestion?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialQuestion
      ? [{ role: "assistant", content: `关于这个问题，你有什么想法吗？\n\n### ${initialQuestion}\n\n你可以尝试用自己的话向我解释，如果不清楚，可以直接告诉我。` }]
      : []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [input, setInput] = useState("");
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, action: "start" }),
    })
      .then((res) => { if (!cancelled && res.ok) setInitialized(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cardId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (viewport.current) {
        viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
      }
    });
  }, [messages]);

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!initialized || isStreaming) return;
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);
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
    } catch {
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
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <div ref={viewport} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-3xl px-6 py-5 max-w-[85%] text-lg leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'self-end bg-primary/20 text-foreground border border-primary/30'
                  : 'self-start bg-card border border-border'
              }`}
            >
              <div className="prose-kb">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
              {m.isStreaming && (
                <span className="text-sm" style={{ animation: 'blink 1s step-end infinite' }}>▍</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 p-4 border-t border-border bg-background/50 backdrop-blur-md">
        <Textarea
          className="flex-1 bg-accent/50 border-border resize-none text-lg p-4 min-h-[64px] rounded-2xl focus-visible:ring-primary/50"
          placeholder="尝试用自己的话解释..."
          value={input}
          rows={2}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isStreaming}
        />
        <Button
          size="icon-lg"
          className="h-16 w-16 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all self-end"
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          <ArrowUp className="!size-7" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
}
