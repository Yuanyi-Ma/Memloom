import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import { api } from "../services/api";

interface Props {
  current: number;
  total: number;
  category?: string;
}

const COLOR_MAP: Record<string, string> = {
  green: '#22c55e', blue: '#3b82f6', yellow: '#eab308',
  gray: '#9ca3af', red: '#ef4444', violet: '#8b5cf6',
  cyan: '#06b6d4', orange: '#f97316', pink: '#ec4899', teal: '#14b8a6',
};

let _cachedColors: Record<string, string> | null = null;
async function getCategoryColors(): Promise<Record<string, string>> {
  if (_cachedColors) return _cachedColors;
  try {
    const data = await api.getCategories();
    _cachedColors = data.colors;
    return _cachedColors;
  } catch { return {}; }
}

export function ReviewHeader({ current, total, category }: Props) {
  const navigate = useNavigate();
  const progress = total > 0 ? (current / total) * 100 : 0;
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => { getCategoryColors().then(setColors); }, []);

  const hex = category ? (COLOR_MAP[colors[category] || 'gray'] || '#9ca3af') : undefined;

  return (
    <div className="flex items-center gap-3 p-4">
      <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <Progress value={progress} className="flex-1 h-1.5 [&>div]:bg-primary" />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {current} / {total}
      </span>
      {category && hex && (
        <Badge variant="outline" className="text-xs rounded-full" style={{ color: hex, borderColor: `${hex}50` }}>
          {category}
        </Badge>
      )}
    </div>
  );
}
