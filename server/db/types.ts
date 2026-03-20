export interface CardInput {
  id: string;
  title: string;
  category: string;
  tags: string[];
  brief: string;
  detail: string;
  feynman_seed: string;
  status?: string;
  source_session?: string;
}

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

export interface ScheduleInfo {
  ef: number;
  interval_days: number;
  next_review_date: string;
  review_count: number;
  consecutive_correct: number;
  last_rating: string | null;
  last_review_at: string | null;
}

export interface CardDetail extends CardSummary {
  detail: string;
  feynman_seed: string;
  priority: string;
  schedule: ScheduleInfo;
  review_history: ReviewHistoryItem[];
}

export interface CardFilters {
  status?: string;
  category?: string;
  keyword?: string;
  sort?: "created_at" | "next_review_date";
  type?: "all" | "mastered" | "due" | string;
}

export interface ScheduleUpdate {
  ef: number;
  interval_days: number;
  next_review_date: string;
  review_count: number;
  consecutive_correct: number;
  last_rating: string;
  last_review_at: string;
}

export interface ReviewHistoryItem {
  id: number;
  card_id: string;
  reviewed_at: string;
  rating: string;
  session_notes?: string;
}

export interface ReviewRecord {
  card_id: string;
  reviewed_at: string;
  rating: string;
  session_notes?: string;
}

export interface NegativeFeedbackInput {
  card_id: string;
  original_title: string;
  extracted_content: string;
  deleted_at: string;
}

export interface StatsSummary {
  totalCards: number;
  masteredCards: number;
  dueToday: number;
  newToday: number;
}

export interface ExtractHistoryEntry {
  time: string;
  count: number;
}

export interface KBConfig {
  extractIntervalMinutes: number;
  lastExtractTime: string;
  maxNegativeSamples: number;
  categories: string[];
  categoryColors: Record<string, string>;
  extractHistory: ExtractHistoryEntry[];
  initialized: boolean;
}

export interface NegativeSample {
  card_id: string;
  title: string;
  brief: string;
  deleted_at: string;
}
