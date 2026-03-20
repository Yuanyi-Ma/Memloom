import { describe, it, expect } from 'vitest';
import { buildReviewQueue, DueCard } from '../../services/aggregator';

describe('Aggregator - buildReviewQueue', () => {
  // 辅助：快速构建 DueCard
  function card(
    id: string,
    category: string,
    lastRating: string | null,
    reviewCount: number
  ): DueCard {
    return {
      id,
      category,
      last_rating: lastRating,
      review_count: reviewCount,
      next_review_date: '2026-03-12',
    };
  }

  it('空列表返回空队列', () => {
    expect(buildReviewQueue([])).toEqual([]);
  });

  it('单分类内按优先级排序: 不会 > 模糊 > 首次 > 会', () => {
    const cards: DueCard[] = [
      card('c1', 'ai', '会', 5),
      card('c2', 'ai', null, 0),       // 首次
      card('c3', 'ai', '不会', 3),
      card('c4', 'ai', '模糊', 2),
    ];
    const queue = buildReviewQueue(cards);
    expect(queue).toEqual(['c3', 'c4', 'c2', 'c1']);
  });

  it('多分类 round-robin，每组最多 5 张', () => {
    // A 组 6 张、B 组 3 张
    const cards: DueCard[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        card(`a${i}`, 'ai', '不会', 1)
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        card(`b${i}`, 'blockchain', '不会', 1)
      ),
    ];
    const queue = buildReviewQueue(cards, 20);

    // 第一轮：A 取 5，B 取 3
    // 第二轮：A 取 1（剩余的）
    // 期望交替
    expect(queue.slice(0, 5).every((id) => id.startsWith('a'))).toBe(true);
    expect(queue.slice(5, 8).every((id) => id.startsWith('b'))).toBe(true);
    expect(queue[8]).toBe('a5'); // A 组剩余 1 张
    expect(queue.length).toBe(9);
  });

  it('maxCount 截断生效', () => {
    const cards: DueCard[] = Array.from({ length: 30 }, (_, i) =>
      card(`c${i}`, 'general', null, 0)
    );
    const queue = buildReviewQueue(cards, 10);
    expect(queue.length).toBe(10);
  });

  it('默认 maxCount 为 20', () => {
    const cards: DueCard[] = Array.from({ length: 30 }, (_, i) =>
      card(`c${i}`, 'general', null, 0)
    );
    const queue = buildReviewQueue(cards);
    expect(queue.length).toBe(20);
  });

  it('所有卡片同一分类 → 直接按优先级输出', () => {
    const cards: DueCard[] = [
      card('c1', 'blockchain', '会', 5),
      card('c2', 'blockchain', '不会', 2),
      card('c3', 'blockchain', null, 0),
    ];
    const queue = buildReviewQueue(cards);
    expect(queue).toEqual(['c2', 'c3', 'c1']);
  });

  it('3 分类各 2 张，maxCount=5 → 贪心取法', () => {
    const cards: DueCard[] = [
      card('a1', 'ai', '不会', 1),
      card('a2', 'ai', '会', 5),
      card('b1', 'blockchain', '模糊', 2),
      card('b2', 'blockchain', null, 0),
      card('c1', 'general', '不会', 1),
      card('c2', 'general', '会', 3),
    ];
    const queue = buildReviewQueue(cards, 5);
    expect(queue.length).toBe(5);
    // 每组 ≤ 5 张（此处每组只有 2 张），round-robin 取
    // 第一轮 A: a1,a2 (2 张 < 5) → B: b1,b2 (2 张) → 总 4 张还差 1
    // 第二轮没有了，但 C 组还没轮到 → C: c1 → 总 5 张
    expect(queue).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
  });
});
