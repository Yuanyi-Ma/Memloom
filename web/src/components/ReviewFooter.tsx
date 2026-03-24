import { Button } from "@/components/ui/button";
import type { Rating, ViewState } from "../types/index";

interface Props {
  viewState: ViewState;
  onRate: (r: Rating) => void;
  onChat: () => void;
  onShowAnswer: () => void;
}

export function ReviewFooter({ viewState, onRate, onChat, onShowAnswer }: Props) {
  if (viewState === "complete") return null;

  return (
    <div className="flex flex-col items-stretch gap-4 w-full mt-8">
      <p className="text-center text-base text-muted-foreground font-medium opacity-80 tracking-wide">
        👇 请根据你对该知识点的掌握程度进行评估
      </p>
      <div className="feedback-footer">
        {(viewState === "question" || viewState === "answer") && (
          <>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-success/15 hover:bg-success/25 text-success border border-success/30 shadow-[0_0_15px_rgba(62,175,124,0.1)] transition-all"
              onClick={() => onRate("会")}
            >
              ✅ 会
            </Button>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 shadow-[0_0_15px_rgba(94,106,210,0.1)] transition-all"
              onClick={onChat}
            >
              💬 尝试作答
            </Button>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-destructive/15 hover:bg-destructive/25 text-destructive border border-destructive/30 shadow-[0_0_15px_rgba(229,72,77,0.1)] transition-all"
              onClick={() => onRate("不会")}
            >
              ❌ 不会
            </Button>
          </>
        )}
        {viewState === "chat" && (
          <>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-success/15 hover:bg-success/25 text-success border border-success/30 shadow-[0_0_15px_rgba(62,175,124,0.1)] transition-all"
              onClick={() => onRate("会")}
            >
              ✅ 会
            </Button>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 shadow-[0_0_15px_rgba(245,166,35,0.1)] transition-all"
              onClick={() => onRate("模糊")}
            >
              🔶 模糊
            </Button>
            <Button
              className="h-16 rounded-full text-[1.1rem] flex-1 bg-destructive/15 hover:bg-destructive/25 text-destructive border border-destructive/30 shadow-[0_0_15px_rgba(229,72,77,0.1)] transition-all"
              onClick={() => onRate("不会")}
            >
              ❌ 不会
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
