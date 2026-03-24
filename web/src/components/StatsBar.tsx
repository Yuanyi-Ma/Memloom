import type { StatsSummary } from "../types/index";
import { useEffect, useState } from "react";

const STATS_CONFIG = [
  { key: "totalCards" as const, icon: "📚", label: "总收纳", color: "var(--primary)" },
  { key: "masteredCards" as const, icon: "✅", label: "已掌握", color: "#22c55e" },
  { key: "dueToday" as const, icon: "📅", label: "今日待复习", color: "#3b82f6" },
  { key: "newToday" as const, icon: "🆕", label: "今日新增", color: "#eab308" },
];

function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (end === 0) { setValue(0); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration]);
  return <>{value}</>;
}

export function StatsBar({ stats, loading }: { stats?: StatsSummary | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {STATS_CONFIG.map(({ key, icon, label, color }) => (
        <div
          key={key}
          className="p-4 rounded-lg bg-card border border-border transition-all hover:border-muted-foreground/30 hover:-translate-y-0.5 cursor-default"
        >
          {loading || !stats ? (
            <>
              <div className="h-9 w-3/5 mx-auto bg-muted animate-pulse rounded mb-1" />
              <div className="h-4 w-4/5 mx-auto bg-muted animate-pulse rounded" />
            </>
          ) : (
            <>
              <p className="text-center font-bold text-3xl" style={{ color }}>
                <CountUp end={stats[key]} />
              </p>
              <div className="flex justify-center items-center gap-1 mt-1">
                <span className="text-sm text-muted-foreground">{icon} {label}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
