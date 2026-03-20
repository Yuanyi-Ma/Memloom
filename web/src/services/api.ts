import { ApiError } from "../types/index";
import type {
  CardsResponse, CardDetail, ScheduleResponse,
  ReviewQueue, ImportResult, StatsSummary,
  ReviewStartParams, FileContent, CardFilters,
  KBConfigResponse, CategoriesResponse, SkillMeta,
  ExtractHistoryItem,
} from "../types/index";

export { ApiError } from "../types/index";

const API_BASE = "/api";

function toQuery(filters?: Record<string, string | undefined>): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, error.error);
  }
  return res.json();
}

export const api = {
  getCards: (filters?: CardFilters) =>
    request<CardsResponse>(`/cards?${toQuery(filters as any)}`),

  getCardById: (id: string) =>
    request<CardDetail>(`/cards/${id}`),

  deleteCard: (id: string) =>
    request<void>(`/cards/${id}`, { method: "DELETE" }),

  scheduleCard: (id: string, rating: string) =>
    request<ScheduleResponse>(`/cards/${id}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ rating }),
    }),

  startReview: (params: ReviewStartParams) =>
    request<ReviewQueue>("/review/start", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  importMarkdown: (files: FileContent[]) =>
    request<ImportResult>("/import/markdown", {
      method: "POST",
      body: JSON.stringify({ files }),
    }),

  getStats: () => request<StatsSummary>("/stats/summary"),
  getHistoryStats: () => request<import("../types/index").HistoryStat[]>("/stats/history"),

  updateCardStatus: (id: string, status: string) =>
    request<void>(`/cards/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // 配置 API
  getConfig: () => request<KBConfigResponse>("/config"),

  updateConfig: (config: Partial<KBConfigResponse>) =>
    request<KBConfigResponse>("/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  getCategories: () => request<CategoriesResponse>("/config/categories"),

  getGatewayToken: () => request<{ token: string; port: number }>("/config/gateway-token"),

  updateCardCategory: (id: string, category: string) =>
    request<{ success: boolean; category: string }>(`/cards/${id}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    }),

  // Skills API
  getSkills: () => request<{ skills: SkillMeta[] }>("/skills"),
  getSkill: (id: string) => request<SkillMeta>(`/skills/${id}`),
  updateSkill: (id: string, editableContent: string) =>
    request<SkillMeta>(`/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify({ editableContent }),
    }),

  // Extract History API
  getExtractHistory: () =>
    request<ExtractHistoryItem[]>("/config/extract-history"),
};

