export interface DueCard {
  id: string;
  category: string;
  last_rating: string | null; // 会 | 模糊 | 不会 | null(首次)
  review_count: number;
  next_review_date: string;
}

const DEFAULT_MAX_COUNT = 20;
const MAX_PER_GROUP_PER_ROUND = 5;

/**
 * 排序权重映射：数值越小优先级越高
 */
function ratingPriority(
  lastRating: string | null,
  reviewCount: number
): number {
  if (lastRating === '不会') return 0; // 最高优先
  if (lastRating === '模糊') return 1;
  if (reviewCount === 0) return 2; // 首次
  return 3; // "会"
}

/**
 * 按同类聚合策略排列出牌队列。
 * @param dueCards 所有到期卡片
 * @param maxCount 最大出牌数（默认 20）
 * @returns 有序卡片 ID 数组
 */
export function buildReviewQueue(
  dueCards: DueCard[],
  maxCount: number = DEFAULT_MAX_COUNT
): string[] {
  if (dueCards.length === 0) return [];

  // 1. 按 category 分组
  const groups = new Map<string, DueCard[]>();
  for (const card of dueCards) {
    const list = groups.get(card.category) || [];
    list.push(card);
    groups.set(card.category, list);
  }

  // 2. 每组内按 ratingPriority 升序排列
  for (const [, list] of groups) {
    list.sort(
      (a, b) =>
        ratingPriority(a.last_rating, a.review_count) -
        ratingPriority(b.last_rating, b.review_count)
    );
  }

  // 3. 贪心 round-robin 填充
  const result: string[] = [];
  const groupKeys = Array.from(groups.keys());
  const pointers = new Map<string, number>();
  for (const key of groupKeys) {
    pointers.set(key, 0);
  }

  let exhaustedCount = 0;
  while (result.length < maxCount && exhaustedCount < groupKeys.length) {
    exhaustedCount = 0;
    for (const key of groupKeys) {
      if (result.length >= maxCount) break;

      const list = groups.get(key)!;
      const ptr = pointers.get(key)!;

      if (ptr >= list.length) {
        exhaustedCount++;
        continue;
      }

      // 从当前组取最多 MAX_PER_GROUP_PER_ROUND 张
      const take = Math.min(
        MAX_PER_GROUP_PER_ROUND,
        list.length - ptr,
        maxCount - result.length
      );
      for (let i = 0; i < take; i++) {
        result.push(list[ptr + i].id);
      }
      pointers.set(key, ptr + take);
    }
  }

  return result;
}
