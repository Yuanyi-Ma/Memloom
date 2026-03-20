// 卡片摘要（列表展示用）
export interface CardSummary {
  id: string;
  title: string;
  category: string;
  tags: string[];
  brief: string;
  status: string;
  created_at: string;
  schedule?: {
    consecutive_correct: number;
    next_review_date: string;
  };
}

// 调度信息
export interface ScheduleInfo {
  ef: number;
  interval_days: number;
  next_review_date: string;
  review_count: number;
  consecutive_correct: number;
  last_rating: string | null;
}

// 复习历史条目
export interface ReviewHistoryItem {
  id: number;
  card_id: string;
  reviewed_at: string;
  rating: string;
}

// 卡片详情（含调度和复习历史）
export interface CardDetail extends CardSummary {
  detail: string;
  feynman_seed: string;
  priority: string;
  schedule: ScheduleInfo;
  review_history: ReviewHistoryItem[];
}

// 统计摘要
export interface StatsSummary {
  totalCards: number;
  masteredCards: number;
  dueToday: number;
  newToday: number;
}

export interface HistoryStat {
  date: string;
  count: number;
}

// 聊天消息
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

// 评分
export type Rating = "会" | "模糊" | "不会";

// 视图状态
export type ViewState = "question" | "answer" | "chat" | "complete";

// API 请求/响应类型
export interface CardsResponse { cards: CardSummary[] }
export interface ScheduleResponse {
  next_review_date: string;
  ef: number;
  interval_days: number;
  consecutive_correct: number;
  mastered: boolean;
}
export interface ReviewQueue { queue: string[]; total: number }
export interface ImportResult { imported: number }
export interface ReviewStartParams { count?: number; category?: string }
export interface FileContent { filename: string; content: string }
export interface CardFilters {
  status?: string;
  category?: string;
  keyword?: string;
  sort?: string;
  type?: "all" | "mastered" | "due" | string;
}

// API 错误
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// 配置相关类型
export interface KBConfigResponse {
  extractIntervalMinutes: number;
  lastExtractTime: string;
  maxNegativeSamples: number;
  categories: string[];
  categoryColors: Record<string, string>;
}

export interface CategoriesResponse {
  categories: string[];
  colors: Record<string, string>;
}

export interface SkillSection {
  content: string;
  editable: boolean;
  label: string;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  sections: SkillSection[];
}

export interface ExtractHistoryItem {
  time: string;
  count: number;
}
