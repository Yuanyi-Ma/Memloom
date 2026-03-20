import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import {
  insertCard,
  getCardById,
  getDueCards,
  queryCards,
  updateSchedule,
  addReviewRecord,
  getStatsSummary,
  getHistoryStats,
  softDeleteCard,
} from '../../db/queries';
import { calculateNextSchedule, isMastered, INITIAL_EF } from '../../services/scheduler';
import { CardInput, ScheduleUpdate } from '../../db/types';

// =========================================
// 辅助函数
// =========================================
function makeCard(id: string, overrides?: Partial<CardInput>): CardInput {
  return {
    id,
    title: 'Test Card',
    category: 'ai',
    tags: ['test'],
    brief: 'Brief desc',
    detail: 'Detail content',
    feynman_seed: 'Review question',
    ...overrides,
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// =========================================
// 1. 卡片生命周期：创建 → 到期 → 复习 → 推迟
// =========================================
describe('卡片生命周期集成测试', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('新卡片创建当天即到期', () => {
    insertCard(db, makeCard('kb-lc-01'));
    const card = getCardById(db, 'kb-lc-01');
    const today = todayStr();

    // 新卡片的 next_review_date 是创建当天
    expect(card!.schedule.next_review_date).toBe(today);

    // 应出现在今日到期列表中
    const due = getDueCards(db, today);
    expect(due.some(c => c.id === 'kb-lc-01')).toBe(true);
  });

  it('复习评「会」后，卡片从到期列表消失', () => {
    const today = todayStr();
    insertCard(db, makeCard('kb-lc-02'));

    // 复习评分
    const card = getCardById(db, 'kb-lc-02')!;
    const result = calculateNextSchedule(card.schedule, '会', today);
    updateSchedule(db, 'kb-lc-02', {
      ...result,
      last_rating: '会',
      last_review_at: new Date().toISOString(),
    });

    // next_review_date 应在未来
    const due = getDueCards(db, today);
    expect(due.find(c => c.id === 'kb-lc-02')).toBeUndefined();
  });

  it('评「不会」后，卡片明天到期', () => {
    const today = todayStr();
    insertCard(db, makeCard('kb-lc-03'));

    const card = getCardById(db, 'kb-lc-03')!;
    const result = calculateNextSchedule(card.schedule, '不会', today);
    updateSchedule(db, 'kb-lc-03', {
      ...result,
      last_rating: '不会',
      last_review_at: new Date().toISOString(),
    });

    // 今天不再到期
    const dueToday = getDueCards(db, today);
    expect(dueToday.find(c => c.id === 'kb-lc-03')).toBeUndefined();

    // 明天到期
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const dueTomorrow = getDueCards(db, tomorrowStr);
    expect(dueTomorrow.some(c => c.id === 'kb-lc-03')).toBe(true);
  });

  it('连续 3 次「会」后达到掌握状态', () => {
    insertCard(db, makeCard('kb-lc-04'));
    let card = getCardById(db, 'kb-lc-04')!;
    const today = todayStr();

    for (let i = 0; i < 3; i++) {
      const result = calculateNextSchedule(card.schedule, '会', today);
      updateSchedule(db, 'kb-lc-04', {
        ...result,
        last_rating: '会',
        last_review_at: new Date().toISOString(),
      });
      card = getCardById(db, 'kb-lc-04')!;
    }

    expect(card.schedule.consecutive_correct).toBe(3);
    expect(isMastered(card.schedule.consecutive_correct)).toBe(true);

    // Stats 应正确反映
    const stats = getStatsSummary(db, today);
    expect(stats.masteredCards).toBe(1);
  });
});

// =========================================
// 2. getDueCards 时间边界
// =========================================
describe('getDueCards 时间边界', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('next_review_date 恰好等于 today → 到期', () => {
    insertCard(db, makeCard('kb-due-exact'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-12', 'kb-due-exact');

    const due = getDueCards(db, '2026-03-12');
    expect(due.some(c => c.id === 'kb-due-exact')).toBe(true);
  });

  it('next_review_date 在 today 之前 → 到期（逾期）', () => {
    insertCard(db, makeCard('kb-due-past'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-01', 'kb-due-past');

    const due = getDueCards(db, '2026-03-12');
    expect(due.some(c => c.id === 'kb-due-past')).toBe(true);
  });

  it('next_review_date 在 today 之后 → 不到期', () => {
    insertCard(db, makeCard('kb-due-future'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-20', 'kb-due-future');

    const due = getDueCards(db, '2026-03-12');
    expect(due.find(c => c.id === 'kb-due-future')).toBeUndefined();
  });

  it('deleted 卡片不出现在到期列表', () => {
    insertCard(db, makeCard('kb-due-del'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-10', 'kb-due-del');
    softDeleteCard(db, 'kb-due-del');

    const due = getDueCards(db, '2026-03-12');
    expect(due.find(c => c.id === 'kb-due-del')).toBeUndefined();
  });

  it('到期列表按 next_review_date ASC 排序', () => {
    insertCard(db, makeCard('kb-due-s1'));
    insertCard(db, makeCard('kb-due-s2'));
    insertCard(db, makeCard('kb-due-s3'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-05', 'kb-due-s1');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-01', 'kb-due-s2');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-10', 'kb-due-s3');

    const due = getDueCards(db, '2026-03-12');
    expect(due[0].id).toBe('kb-due-s2');
    expect(due[1].id).toBe('kb-due-s1');
    expect(due[2].id).toBe('kb-due-s3');
  });

  it('大量逾期卡片全部返回', () => {
    for (let i = 0; i < 50; i++) {
      insertCard(db, makeCard(`kb-due-bulk-${i}`));
      db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
        .run('2020-01-01', `kb-due-bulk-${i}`);
    }

    const due = getDueCards(db, '2026-03-12');
    expect(due.length).toBe(50);
  });
});

// =========================================
// 3. queryCards type='due' 过滤
// =========================================
describe('queryCards type=due 时间过滤', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('type=due 只返回到期卡片', () => {
    insertCard(db, makeCard('kb-qd-01'));
    insertCard(db, makeCard('kb-qd-02'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2020-01-01', 'kb-qd-01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2099-12-31', 'kb-qd-02');

    const cards = queryCards(db, { type: 'due' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qd-01');
  });

  it('type=mastered 只返回已掌握卡片', () => {
    insertCard(db, makeCard('kb-qm-01'));
    insertCard(db, makeCard('kb-qm-02'));
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?')
      .run(3, 'kb-qm-01');
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?')
      .run(1, 'kb-qm-02');

    const cards = queryCards(db, { type: 'mastered' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qm-01');
  });

  it('sort=next_review_date 正确排序', () => {
    insertCard(db, makeCard('kb-qsort-01'));
    insertCard(db, makeCard('kb-qsort-02'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-20', 'kb-qsort-01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-10', 'kb-qsort-02');

    const cards = queryCards(db, { sort: 'next_review_date' });
    expect(cards[0].id).toBe('kb-qsort-02');
  });

  it('type=due 结合 category 过滤', () => {
    insertCard(db, makeCard('kb-qdc-01', { category: 'ai' }));
    insertCard(db, makeCard('kb-qdc-02', { category: 'blockchain' }));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2020-01-01', 'kb-qdc-01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2020-01-01', 'kb-qdc-02');

    const cards = queryCards(db, { type: 'due', category: 'ai' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qdc-01');
  });
});

// =========================================
// 4. getStatsSummary 时间精确性
// =========================================
describe('getStatsSummary 时间边界', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('空数据库所有计数为 0', () => {
    const stats = getStatsSummary(db, '2026-03-12');
    expect(stats).toEqual({ totalCards: 0, masteredCards: 0, dueToday: 0, newToday: 0 });
  });

  it('dueToday：next_review_date <= today 的卡片计数正确', () => {
    insertCard(db, makeCard('kb-st-d1'));
    insertCard(db, makeCard('kb-st-d2'));
    insertCard(db, makeCard('kb-st-d3'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-10', 'kb-st-d1'); // 逾期
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-12', 'kb-st-d2'); // 今天
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?')
      .run('2026-03-15', 'kb-st-d3'); // 未来

    const stats = getStatsSummary(db, '2026-03-12');
    expect(stats.dueToday).toBe(2); // d1 + d2
  });

  it('masteredCards：consecutive_correct >= 3 的计数正确', () => {
    insertCard(db, makeCard('kb-st-m1'));
    insertCard(db, makeCard('kb-st-m2'));
    insertCard(db, makeCard('kb-st-m3'));
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(3, 'kb-st-m1');
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(5, 'kb-st-m2');
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(2, 'kb-st-m3');

    const stats = getStatsSummary(db, '2026-03-12');
    expect(stats.masteredCards).toBe(2);
  });

  it('newToday：created_at >= today T00:00:00 的卡片', () => {
    insertCard(db, makeCard('kb-st-n1'));
    // 手动设置为昨天创建
    db.prepare('UPDATE cards SET created_at = ? WHERE id = ?')
      .run('2026-03-11T23:59:59Z', 'kb-st-n1');
    insertCard(db, makeCard('kb-st-n2'));
    // 保持今天创建（默认）

    const today = todayStr();
    const stats = getStatsSummary(db, today);
    expect(stats.newToday).toBe(1); // 只有 n2
  });

  it('deleted 卡片不计入 totalCards', () => {
    insertCard(db, makeCard('kb-st-del'));
    softDeleteCard(db, 'kb-st-del');

    const stats = getStatsSummary(db, '2026-03-12');
    expect(stats.totalCards).toBe(0);
  });

  it('pending 卡片不计入 totalCards（仅 active）', () => {
    insertCard(db, makeCard('kb-st-pend', { status: 'pending' }));

    const stats = getStatsSummary(db, '2026-03-12');
    expect(stats.totalCards).toBe(0);
  });
});

// =========================================
// 5. getHistoryStats 时间聚合
// =========================================
describe('getHistoryStats 时间聚合', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('无复习历史 → 14 天全部为 0', () => {
    const history = getHistoryStats(db);
    expect(history.length).toBe(14);
    history.forEach(d => expect(d.count).toBe(0));
  });

  it('今天的复习正确聚合', () => {
    insertCard(db, makeCard('kb-h-01'));
    const today = todayStr();
    addReviewRecord(db, { card_id: 'kb-h-01', reviewed_at: today + 'T10:00:00Z', rating: '会' });
    addReviewRecord(db, { card_id: 'kb-h-01', reviewed_at: today + 'T11:00:00Z', rating: '模糊' });
    addReviewRecord(db, { card_id: 'kb-h-01', reviewed_at: today + 'T15:00:00Z', rating: '不会' });

    const history = getHistoryStats(db);
    const todayEntry = history.find(d => d.date === today);
    expect(todayEntry!.count).toBe(3);
  });

  it('不同天的复习分别聚合', () => {
    insertCard(db, makeCard('kb-h-02'));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr2 = today.toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    addReviewRecord(db, { card_id: 'kb-h-02', reviewed_at: todayStr2 + 'T10:00:00Z', rating: '会' });
    addReviewRecord(db, { card_id: 'kb-h-02', reviewed_at: yesterdayStr + 'T10:00:00Z', rating: '会' });
    addReviewRecord(db, { card_id: 'kb-h-02', reviewed_at: yesterdayStr + 'T11:00:00Z', rating: '模糊' });

    const history = getHistoryStats(db);
    const todayData = history.find(d => d.date === todayStr2);
    const yesterdayData = history.find(d => d.date === yesterdayStr);
    expect(todayData!.count).toBe(1);
    expect(yesterdayData!.count).toBe(2);
  });

  it('多张卡片同一天的复习合并计算', () => {
    insertCard(db, makeCard('kb-h-03'));
    insertCard(db, makeCard('kb-h-04'));
    const today = todayStr();

    addReviewRecord(db, { card_id: 'kb-h-03', reviewed_at: today + 'T10:00:00Z', rating: '会' });
    addReviewRecord(db, { card_id: 'kb-h-04', reviewed_at: today + 'T10:05:00Z', rating: '模糊' });

    const history = getHistoryStats(db);
    const todayEntry = history.find(d => d.date === today);
    expect(todayEntry!.count).toBe(2);
  });

  it('每个条目格式正确：YYYY-MM-DD + number', () => {
    const history = getHistoryStats(db);
    history.forEach(d => {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof d.count).toBe('number');
      expect(d.count).toBeGreaterThanOrEqual(0);
    });
  });

  it('结果按日期升序排列', () => {
    const history = getHistoryStats(db);
    for (let i = 1; i < history.length; i++) {
      expect(history[i].date > history[i - 1].date).toBe(true);
    }
  });
});

// =========================================
// 6. 复习评分 → Schedule + History 联动验证
// =========================================
describe('复习评分端到端联动', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('评分后 schedule 和 review_history 同时更新', () => {
    insertCard(db, makeCard('kb-e2e-01'));
    const today = todayStr();
    const now = new Date().toISOString();

    // 获取当前 schedule
    const card = getCardById(db, 'kb-e2e-01')!;
    const result = calculateNextSchedule(card.schedule, '会', today);

    // 更新 schedule
    updateSchedule(db, 'kb-e2e-01', {
      ...result,
      last_rating: '会',
      last_review_at: now,
    });

    // 添加 review record
    addReviewRecord(db, {
      card_id: 'kb-e2e-01',
      reviewed_at: now,
      rating: '会',
      session_notes: 'Good understanding',
    });

    // 验证
    const updated = getCardById(db, 'kb-e2e-01')!;
    expect(updated.schedule.ef).toBe(2.6);
    expect(updated.schedule.last_rating).toBe('会');
    expect(updated.schedule.last_review_at).toBe(now);
    expect(updated.review_history.length).toBe(1);
    expect(updated.review_history[0].rating).toBe('会');
  });

  it('多次评分后 review_history 按时间倒序排列', () => {
    insertCard(db, makeCard('kb-e2e-02'));
    const today = todayStr();

    // 3 次复习
    for (let i = 0; i < 3; i++) {
      const card = getCardById(db, 'kb-e2e-02')!;
      const result = calculateNextSchedule(card.schedule, '会', today);
      const reviewTime = `${today}T1${i}:00:00Z`;

      updateSchedule(db, 'kb-e2e-02', {
        ...result,
        last_rating: '会',
        last_review_at: reviewTime,
      });
      addReviewRecord(db, {
        card_id: 'kb-e2e-02',
        reviewed_at: reviewTime,
        rating: '会',
      });
    }

    const card = getCardById(db, 'kb-e2e-02')!;
    expect(card.review_history.length).toBe(3);
    // review_history 按 reviewed_at DESC 返回
    expect(card.review_history[0].reviewed_at > card.review_history[1].reviewed_at).toBe(true);
    expect(card.review_history[1].reviewed_at > card.review_history[2].reviewed_at).toBe(true);
  });

  it('评分「不会」→「模糊」→「会」→「会」→「会」的完整恢复路径', () => {
    insertCard(db, makeCard('kb-e2e-03'));
    const today = todayStr();
    const ratings: string[] = ['不会', '模糊', '会', '会', '会'];

    for (const rating of ratings) {
      const card = getCardById(db, 'kb-e2e-03')!;
      const result = calculateNextSchedule(card.schedule, rating as any, today);
      updateSchedule(db, 'kb-e2e-03', {
        ...result,
        last_rating: rating,
        last_review_at: new Date().toISOString(),
      });
      addReviewRecord(db, {
        card_id: 'kb-e2e-03',
        reviewed_at: new Date().toISOString(),
        rating,
      });
    }

    const final = getCardById(db, 'kb-e2e-03')!;
    expect(final.schedule.review_count).toBe(5);
    expect(final.schedule.consecutive_correct).toBe(3);
    expect(isMastered(final.schedule.consecutive_correct)).toBe(true);
    expect(final.review_history.length).toBe(5);

    // Stats 验证
    const stats = getStatsSummary(db, today);
    expect(stats.masteredCards).toBe(1);
  });
});

// =========================================
// 7. insertCard 初始 schedule 时间
// =========================================
describe('insertCard 初始 schedule', () => {
  let db: Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('新卡片的 schedule 初始化正确', () => {
    insertCard(db, makeCard('kb-init-01'));
    const card = getCardById(db, 'kb-init-01')!;

    expect(card.schedule.ef).toBe(2.5);
    expect(card.schedule.interval_days).toBe(1);
    expect(card.schedule.review_count).toBe(0);
    expect(card.schedule.consecutive_correct).toBe(0);
    expect(card.schedule.last_rating).toBeNull();
    expect(card.schedule.last_review_at).toBeNull();
  });

  it('新卡片的 next_review_date 是创建日期', () => {
    insertCard(db, makeCard('kb-init-02'));
    const card = getCardById(db, 'kb-init-02')!;
    const today = todayStr();

    expect(card.schedule.next_review_date).toBe(today);
  });

  it('新卡片的 created_at 和 updated_at 是当前时间', () => {
    insertCard(db, makeCard('kb-init-03'));
    const card = getCardById(db, 'kb-init-03')!;

    // 验证 ISO 格式
    expect(card.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // created_at 和今天同一天
    expect(card.created_at.slice(0, 10)).toBe(todayStr());
  });
});
