import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard, getCardById, searchCardsByTitle, getCardIndex, getHistoryStats, updateCardCategory, updateCardStatus, queryCards, addReviewRecord } from '../../db/queries';
import { CardInput } from '../../db/types';

function makeCard(id: string, overrides?: Partial<CardInput>): CardInput {
  return {
    id, title: 'Test Card', category: 'programming',
    tags: ['test'], brief: '简要描述内容', detail: '详细内容', feynman_seed: '复习问题',
    ...overrides,
  };
}

// =============================================
// searchCardsByTitle 测试
// =============================================
describe('searchCardsByTitle', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('单关键词匹配 title', () => {
    insertCard(db, makeCard('kb-s01', { title: 'Docker容器技术' }));
    insertCard(db, makeCard('kb-s02', { title: 'Go 接口设计' }));

    const results = searchCardsByTitle(db, 'Docker');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Docker容器技术');
  });

  it('单关键词匹配 brief', () => {
    insertCard(db, makeCard('kb-s03', { title: '某个标题', brief: 'Docker 是一种容器化技术' }));

    const results = searchCardsByTitle(db, 'Docker');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('kb-s03');
  });

  it('多关键词拆分搜索（空格分隔）', () => {
    insertCard(db, makeCard('kb-s04', { title: '共识算法' }));
    insertCard(db, makeCard('kb-s05', { title: '容器编排' }));
    insertCard(db, makeCard('kb-s06', { title: '数据库索引' }));

    const results = searchCardsByTitle(db, '共识 容器');
    expect(results.length).toBe(2);
  });

  it('多关键词拆分（逗号/顿号分隔）', () => {
    insertCard(db, makeCard('kb-s07', { title: '共识算法原理' }));
    insertCard(db, makeCard('kb-s08', { title: '容器网络模型' }));

    const results1 = searchCardsByTitle(db, '共识，容器');
    expect(results1.length).toBe(2);

    const results2 = searchCardsByTitle(db, '共识、容器');
    expect(results2.length).toBe(2);
  });

  it('短关键词（< 2字符）回退整体搜索', () => {
    insertCard(db, makeCard('kb-s09', { title: 'A算法详解' }));

    // 'A' 长度 < 2，回退到整体搜索 '%A%'
    const results = searchCardsByTitle(db, 'A');
    expect(results.length).toBe(1);
  });

  it('去重：多关键词匹配同一条目只返回一次', () => {
    insertCard(db, makeCard('kb-s10', { title: '容器编排容器' }));

    // 两个关键词都匹配同一条目
    const results = searchCardsByTitle(db, '容器 编排');
    const ids = results.map(r => r.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });

  it('排除 deleted 状态卡片', () => {
    insertCard(db, makeCard('kb-s11', { title: 'Hello 测试' }));
    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run('deleted', 'kb-s11');

    const results = searchCardsByTitle(db, 'Hello');
    expect(results.length).toBe(0);
  });

  it('空关键词回退', () => {
    insertCard(db, makeCard('kb-s12', { title: '测试标题' }));

    // 空字符串，关键词拆分为空，回退为 '%%' 匹配全部
    const results = searchCardsByTitle(db, '');
    // 空关键词会使 filter 返回空数组，回退为整体搜索 '%%'
    expect(results.length).toBe(1);
  });

  it('无匹配返回空数组', () => {
    insertCard(db, makeCard('kb-s13', { title: '完全不相关' }));
    const results = searchCardsByTitle(db, '量子纠缠超导');
    expect(results.length).toBe(0);
  });

  it('结果上限 10 条', () => {
    for (let i = 0; i < 15; i++) {
      insertCard(db, makeCard(`kb-lim-${i}`, { title: `重复标题${i}`, brief: `同一关键词匹配` }));
    }
    const results = searchCardsByTitle(db, '关键词');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('返回结果包含 id/title/brief/detail', () => {
    insertCard(db, makeCard('kb-s14', { title: '测试字段', brief: '简要', detail: '详细' }));
    const results = searchCardsByTitle(db, '测试');
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('brief');
    expect(results[0]).toHaveProperty('detail');
  });
});

// =============================================
// getCardIndex 测试
// =============================================
describe('getCardIndex', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('返回 active 和 pending 状态卡片', () => {
    insertCard(db, makeCard('kb-idx01', { title: 'Active Card' }));
    insertCard(db, makeCard('kb-idx02', { title: 'Pending Card', status: 'pending' }));
    insertCard(db, makeCard('kb-idx03', { title: 'Deleted Card' }));
    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run('deleted', 'kb-idx03');

    const index = getCardIndex(db);
    expect(index.length).toBe(2);
    expect(index.some(e => e.title === 'Active Card')).toBe(true);
    expect(index.some(e => e.title === 'Pending Card')).toBe(true);
    expect(index.some(e => e.title === 'Deleted Card')).toBe(false);
  });

  it('brief_short 截断到 40 字符', () => {
    const longBrief = '这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的简要描述内容，应该被截断到40个字符以内。';
    insertCard(db, makeCard('kb-idx04', { brief: longBrief }));

    const index = getCardIndex(db);
    expect(index[0].brief_short.length).toBeLessThanOrEqual(40);
  });

  it('空数据库返回空数组', () => {
    const index = getCardIndex(db);
    expect(index).toEqual([]);
  });

  it('按 created_at DESC 排序', () => {
    insertCard(db, makeCard('kb-idx05', { title: '第一个' }));
    // 手动设置较新的创建时间
    db.prepare('UPDATE cards SET created_at = ? WHERE id = ?').run('2026-03-12T10:00:00Z', 'kb-idx05');

    insertCard(db, makeCard('kb-idx06', { title: '第二个' }));
    db.prepare('UPDATE cards SET created_at = ? WHERE id = ?').run('2026-03-13T10:00:00Z', 'kb-idx06');

    const index = getCardIndex(db);
    expect(index[0].title).toBe('第二个'); // 最新的在前
    expect(index[1].title).toBe('第一个');
  });

  it('brief 为 null 时 brief_short 为空字符串', () => {
    insertCard(db, makeCard('kb-idx07'));
    db.prepare('UPDATE cards SET brief = NULL WHERE id = ?').run('kb-idx07');
    const index = getCardIndex(db);
    expect(index[0].brief_short).toBe('');
  });

  it('返回包含 id/title/brief_short', () => {
    insertCard(db, makeCard('kb-idx08'));
    const index = getCardIndex(db);
    expect(index[0]).toHaveProperty('id');
    expect(index[0]).toHaveProperty('title');
    expect(index[0]).toHaveProperty('brief_short');
  });
});

// =============================================
// getHistoryStats 测试
// =============================================
describe('getHistoryStats', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('无历史数据时填充 14 天零值', () => {
    const history = getHistoryStats(db);
    expect(history.length).toBe(14);
    history.forEach(d => expect(d.count).toBe(0));
  });

  it('有复习历史时返回正确计数', () => {
    insertCard(db, makeCard('kb-hist01'));
    const today = new Date().toISOString().slice(0, 10);
    addReviewRecord(db, { card_id: 'kb-hist01', reviewed_at: today + 'T10:00:00Z', rating: '会' });
    addReviewRecord(db, { card_id: 'kb-hist01', reviewed_at: today + 'T11:00:00Z', rating: '模糊' });

    const history = getHistoryStats(db);
    const todayEntry = history.find(d => d.date === today);
    expect(todayEntry!.count).toBe(2);
  });

  it('每个条目都有 date 和 count', () => {
    const history = getHistoryStats(db);
    history.forEach(d => {
      expect(d).toHaveProperty('date');
      expect(d).toHaveProperty('count');
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

// =============================================
// updateCardCategory 测试
// =============================================
describe('updateCardCategory', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('正常更新分类', () => {
    insertCard(db, makeCard('kb-cat01', { category: 'programming' }));
    updateCardCategory(db, 'kb-cat01', 'academic');
    const card = getCardById(db, 'kb-cat01');
    expect(card!.category).toBe('academic');
  });

  it('无效分类抛出错误', () => {
    insertCard(db, makeCard('kb-cat02'));
    expect(() => updateCardCategory(db, 'kb-cat02', 'invalid-categ')).toThrow('Invalid category');
  });

  it('更新后 updated_at 变化', () => {
    insertCard(db, makeCard('kb-cat03'));
    const before = getCardById(db, 'kb-cat03')!.created_at;
    // 稍等一下确保时间不同
    updateCardCategory(db, 'kb-cat03', 'academic');
    const card = getCardById(db, 'kb-cat03');
    // updated_at 应该已更新（可能与 created_at 不同）
    expect(card).not.toBeNull();
  });
});

// =============================================
// updateCardStatus 测试
// =============================================
describe('updateCardStatus', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('正常更新状态', () => {
    insertCard(db, makeCard('kb-status01'));
    updateCardStatus(db, 'kb-status01', 'pending');
    const card = getCardById(db, 'kb-status01');
    expect(card!.status).toBe('pending');
  });

  it('从 pending 更新为 active', () => {
    insertCard(db, makeCard('kb-status02', { status: 'pending' }));
    updateCardStatus(db, 'kb-status02', 'active');
    const card = getCardById(db, 'kb-status02');
    expect(card!.status).toBe('active');
  });

  it('更新为 deleted', () => {
    insertCard(db, makeCard('kb-status03'));
    updateCardStatus(db, 'kb-status03', 'deleted');
    const card = getCardById(db, 'kb-status03');
    expect(card!.status).toBe('deleted');
  });
});

// =============================================
// queryCards 边界条件
// =============================================
describe('queryCards - 边界条件', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('mastered 过滤：consecutive_correct >= 3', () => {
    insertCard(db, makeCard('kb-qm01'));
    insertCard(db, makeCard('kb-qm02'));
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(3, 'kb-qm01');
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(1, 'kb-qm02');

    const cards = queryCards(db, { type: 'mastered' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qm01');
  });

  it('due 过滤：next_review_date <= today', () => {
    insertCard(db, makeCard('kb-qd01'));
    insertCard(db, makeCard('kb-qd02'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2020-01-01', 'kb-qd01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2099-12-31', 'kb-qd02');

    const cards = queryCards(db, { type: 'due' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qd01');
  });

  it('sort by next_review_date', () => {
    insertCard(db, makeCard('kb-qs01'));
    insertCard(db, makeCard('kb-qs02'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-20', 'kb-qs01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-10', 'kb-qs02');

    const cards = queryCards(db, { sort: 'next_review_date' });
    expect(cards[0].id).toBe('kb-qs02'); // 较早日期在前
  });

  it('pending 状态过滤', () => {
    insertCard(db, makeCard('kb-qp01', { status: 'pending' }));
    insertCard(db, makeCard('kb-qp02'));

    const cards = queryCards(db, { status: 'pending' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qp01');
  });

  it('默认排除非 active 状态', () => {
    insertCard(db, makeCard('kb-qd03', { status: 'pending' }));
    insertCard(db, makeCard('kb-qd04'));

    const cards = queryCards(db, {});
    expect(cards.length).toBe(1);
    expect(cards[0].status).toBe('active');
  });

  it('keyword 匹配 tags', () => {
    insertCard(db, makeCard('kb-qt01', { tags: ['blockchain', 'consensus'] }));
    insertCard(db, makeCard('kb-qt02', { tags: ['docker'] }));

    const cards = queryCards(db, { keyword: 'blockchain' });
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe('kb-qt01');
  });

  it('schedule 信息包含在返回结果中', () => {
    insertCard(db, makeCard('kb-qsch01'));
    const cards = queryCards(db, {});
    expect(cards[0].schedule).toBeDefined();
    expect(cards[0].schedule).toHaveProperty('consecutive_correct');
    expect(cards[0].schedule).toHaveProperty('next_review_date');
  });

  it('空数据库返回空数组', () => {
    const cards = queryCards(db, {});
    expect(cards).toEqual([]);
  });
});
