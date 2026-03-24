import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2 } from "lucide-react";
import type { CardSummary } from "../types/index";
import { api } from "../services/api";

let _cachedColors: Record<string, string> | null = null;
async function getCategoryColors(): Promise<Record<string, string>> {
  if (_cachedColors) return _cachedColors;
  try {
    const data = await api.getCategories();
    _cachedColors = data.colors;
    return _cachedColors;
  } catch {
    return {};
  }
}

const COLOR_MAP: Record<string, string> = {
  green: '#22c55e', blue: '#3b82f6', yellow: '#eab308',
  gray: '#9ca3af', red: '#ef4444', violet: '#8b5cf6',
  cyan: '#06b6d4', orange: '#f97316', pink: '#ec4899', teal: '#14b8a6',
};

function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 86400000;
}

export function CardListItem({
  card, onClick, onDelete
}: {
  card: CardSummary;
  onClick?: () => void;
  onDelete: (id: string) => void;
  highlight?: string
}) {
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => { getCategoryColors().then(setColors); }, []);

  const progressValue = card.schedule ? Math.min((card.schedule.consecutive_correct / 3) * 100, 100) : 0;
  const isMastered = card.schedule && card.schedule.consecutive_correct >= 3;

  const badgeStyle = {
    backgroundColor: `${COLOR_MAP[colors[card.category] || 'gray']}15`,
    color: COLOR_MAP[colors[card.category] || 'gray'],
    borderColor: `${COLOR_MAP[colors[card.category] || 'gray']}30`,
  };

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden transition-all cursor-pointer hover:border-muted-foreground/30 hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <Badge variant="outline" className="shrink-0" style={badgeStyle}>
          {card.category}
        </Badge>
        <span className="text-base flex-1 truncate">{card.title}</span>
        {isNew(card.created_at) && (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">NEW</Badge>
        )}
        <div className="w-20 ml-2 mr-1 flex items-center">
          <Progress
            value={progressValue}
            className={`h-1.5 ${isMastered ? '[&>div]:bg-green-500' : '[&>div]:bg-blue-500'}`}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(card.created_at).toLocaleDateString()}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={e => { e.stopPropagation(); onDelete(card.id); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
