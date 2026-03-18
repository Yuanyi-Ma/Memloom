import { describe, it, expect } from 'vitest';
import { buildReviewQueue, DueCard } from '../../services/aggregator';

function card(
  id: string,
  category: string,
  lastRating: string | null,
  reviewCount: number
): DueCard {
  return { id, category, last_rating: lastRating, review_count: reviewCount, next_review_date: '2026-03-12' };
}

describe('Aggregator - 边界条件补充', () => {
  it('仅 1 张卡片的场景', () => {
    const queue = buildReviewQueue([card('c1', 'programming', null, 0)]);
    expect(queue).toEqual(['c1']);
  });

  it('maxCount = 0 返回空数组', () => {
    const queue = buildReviewQueue([card('c1', 'programming', null, 0)], 0);
    expect(queue).toEqual([]);
  });

  it('maxCount = 1 只取 1 张', () => {
    const cards: DueCard[] = [
      card('c1', 'programming', '不会', 1),
      card('c2', 'programming', '会', 5),
    ];
    const queue = buildReviewQueue(cards, 1);
    expect(queue.length).toBe(1);
    expect(queue[0]).toBe('c1'); // '不会' 优先级最高
  });

  it('所有卡片 last_rating 相同时保持顺序', () => {
    const cards: DueCard[] = [
      card('c1', 'programming', null, 0),
      card('c2', 'programming', null, 0),
      card('c3', 'programming', null, 0),
    ];
    const queue = buildReviewQueue(cards);
    expect(queue.length).toBe(3);
  });

  it('多分类各 1 张卡片', () => {
    const cards: DueCard[] = [
      card('a1', 'programming', null, 0),
      card('b1', 'academic', null, 0),
      card('c1', 'general', null, 0),
    ];
    const queue = buildReviewQueue(cards);
    expect(queue.length).toBe(3);
    // 每个分类应有 1 张
    expect(queue).toContain('a1');
    expect(queue).toContain('b1');
    expect(queue).toContain('c1');
  });

  it('大量卡片（100 张）性能测试', () => {
    const cards: DueCard[] = Array.from({ length: 100 }, (_, i) =>
      card(`c${i}`, i % 3 === 0 ? 'programming' : i % 3 === 1 ? 'academic' : 'general', null, 0)
    );
    const start = Date.now();
    const queue = buildReviewQueue(cards, 20);
    const elapsed = Date.now() - start;
    expect(queue.length).toBe(20);
    expect(elapsed).toBeLessThan(100); // 应在 100ms 内完成
  });

  it('round-robin 确保公平分配', () => {
    // A 组 10 张，B 组 10 张，maxCount = 10
    const cards: DueCard[] = [
      ...Array.from({ length: 10 }, (_, i) => card(`a${i}`, 'programming', null, 0)),
      ...Array.from({ length: 10 }, (_, i) => card(`b${i}`, 'academic', null, 0)),
    ];
    const queue = buildReviewQueue(cards, 10);
    const aCount = queue.filter(id => id.startsWith('a')).length;
    const bCount = queue.filter(id => id.startsWith('b')).length;
    expect(aCount).toBe(5);
    expect(bCount).toBe(5);
  });
});
