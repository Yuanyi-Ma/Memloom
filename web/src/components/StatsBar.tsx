import { SimpleGrid, Paper, Text, Group, Skeleton } from "@mantine/core";
import type { StatsSummary } from "../types/index";
import { useEffect, useState } from "react";

const STATS_CONFIG = [
  { key: "totalCards" as const, icon: "📚", label: "总收纳", color: "var(--mantine-color-brand-5)" },
  { key: "masteredCards" as const, icon: "✅", label: "已掌握", color: "var(--mantine-color-green-5)" },
  { key: "dueToday" as const, icon: "📅", label: "今日待复习", color: "var(--mantine-color-blue-5)" },
  { key: "newToday" as const, icon: "🆕", label: "今日新增", color: "var(--mantine-color-yellow-5)" },
];

function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (end === 0) { setValue(0); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration]);
  return <>{value}</>;
}

export function StatsBar({ stats, loading }: { stats?: StatsSummary | null; loading?: boolean }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
      {STATS_CONFIG.map(({ key, icon, label, color }) => (
        <Paper
          key={key}
          p="md"
          radius="md"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            transition: 'border-color 150ms ease, transform 150ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = color;
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {loading || !stats ? (
            <>
              <Skeleton height={36} mb={4} width="60%" mx="auto" />
              <Skeleton height={16} width="80%" mx="auto" />
            </>
          ) : (
            <>
              <Text ta="center" fw={700} fz={32} style={{ color }}>
                <CountUp end={stats[key]} />
              </Text>
              <Group justify="center" gap={4} mt={4}>
                <Text fz="sm" c="dimmed">{icon} {label}</Text>
              </Group>
            </>
          )}
        </Paper>
      ))}
    </SimpleGrid>
  );
}
