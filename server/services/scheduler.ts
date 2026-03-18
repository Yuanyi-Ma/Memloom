export const INITIAL_EF = 2.5;
export const MIN_EF = 1.3;
export const MAX_EF = 3.0;
export const MASTERED_THRESHOLD = 3;

export interface ScheduleState {
  ef: number;
  interval_days: number;
  review_count: number;
  consecutive_correct: number;
}

export type Rating = '会' | '模糊' | '不会';

export interface ScheduleResult {
  ef: number;
  interval_days: number;
  next_review_date: string; // YYYY-MM-DD
  review_count: number;
  consecutive_correct: number;
}

/**
 * SM-2 核心调度函数：根据当前状态和用户定级，计算下一次复习参数。
 * 纯函数，无副作用。
 */
export function calculateNextSchedule(
  current: ScheduleState,
  rating: Rating,
  today: string // YYYY-MM-DD
): ScheduleResult {
  const newReviewCount = current.review_count + 1;
  let newEf: number;
  let newInterval: number;
  let newConsecutive: number;

  if (rating === '会') {
    newConsecutive = current.consecutive_correct + 1;
    newEf = Math.min(MAX_EF, current.ef + 0.1);
    newInterval = Math.max(1, Math.floor(current.interval_days * newEf));
  } else if (rating === '模糊') {
    newConsecutive = 0;
    newEf = Math.max(MIN_EF, current.ef - 0.15);
    newInterval = 2;
  } else {
    // '不会'
    newConsecutive = 0;
    newEf = Math.max(MIN_EF, current.ef - 0.3);
    newInterval = 1;
  }

  // 避免浮点精度问题
  newEf = Math.round(newEf * 100) / 100;

  const nextReviewDate = addDays(today, newInterval);

  return {
    ef: newEf,
    interval_days: newInterval,
    next_review_date: nextReviewDate,
    review_count: newReviewCount,
    consecutive_correct: newConsecutive,
  };
}

/** 判断卡片是否已掌握 */
export function isMastered(consecutiveCorrect: number): boolean {
  return consecutiveCorrect >= MASTERED_THRESHOLD;
}

/**
 * 日期加天数工具函数。
 * @param dateStr YYYY-MM-DD 格式日期
 * @param days 要加的天数
 * @returns YYYY-MM-DD 格式日期
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
