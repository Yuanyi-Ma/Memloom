import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { KBConfigResponse } from "../types/index";

const DEFAULT_CONFIG: KBConfigResponse = {
  extractIntervalMinutes: 30,
  lastExtractTime: new Date(0).toISOString(),
  maxNegativeSamples: 50,
  categories: ["ai", "academic", "general"],
  categoryColors: {
    ai: "green",
    academic: "blue",
    general: "gray",
  },
  initialized: false,
};

export function useConfig() {
  const [config, setConfig] = useState<KBConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getConfig();
      setConfig(data);
    } catch (e: any) {
      // API 不可用时使用默认配置
      setConfig(DEFAULT_CONFIG);
      setError(null); // 不显示错误，静默降级
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (updated: Partial<KBConfigResponse>) => {
    setSaving(true);
    setError(null);
    try {
      const data = await api.updateConfig(updated);
      setConfig(data);
      return true;
    } catch (e: any) {
      setError(e.message || "保存失败，请确认后端服务已启动");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, loading, saving, error, fetchConfig, saveConfig };
}

