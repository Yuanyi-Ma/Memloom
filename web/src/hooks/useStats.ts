import { useState, useEffect } from "react";
import { api } from "../services/api";
import type { StatsSummary, HistoryStat } from "../types/index";

export function useStats() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [history, setHistory] = useState<HistoryStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getHistoryStats()])
      .then(([s, h]) => {
        setStats(s);
        setHistory(h);
      })
      .catch(() => {
        setStats(null);
        setHistory([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { stats, history, loading };
}
