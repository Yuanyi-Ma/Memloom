import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/schema';
import { insertCard, getCardById, softDeleteCard, queryCards } from '../../db/queries';
import { CardInput } from '../../db/types';
import { Database } from 'better-sqlite3';

describe('Database Queries - Core', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should insert and get card by id', () => {
    const cardInput: CardInput = {
      id: 'kb-20260304-0001',
      title: 'Test Card',
      category: 'programming',
      tags: ['test'],
      brief: 'test brief',
      detail: 'test detail',
      feynman_seed: 'test seed'
    };

    insertCard(db, cardInput);

    const fetched = getCardById(db, cardInput.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Test Card');
    expect(fetched?.schedule.ef).toBe(2.5); // Default
  });

  it('should soft delete a card', () => {
    const cardInput: CardInput = {
      id: 'kb-20260304-0002',
      title: 'Delete Me',
      category: 'general',
      tags: ['delete'],
      brief: 'to be deleted',
      detail: 'detail',
      feynman_seed: 'seed'
    };

    insertCard(db, cardInput);
    softDeleteCard(db, cardInput.id);

    const fetched = getCardById(db, cardInput.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe('deleted');
  });

  it('should query cards with filters', () => {
    const card1: CardInput = {
      id: 'kb-20260304-0003',
      title: 'Programming Card',
      category: 'programming',
      tags: ['js'],
      brief: 'js brief',
      detail: 'detail',
      feynman_seed: 'seed'
    };
    const card2: CardInput = {
      id: 'kb-20260304-0004',
      title: 'Academic Card',
      category: 'academic',
      tags: ['math'],
      brief: 'math brief',
      detail: 'detail',
      feynman_seed: 'seed'
    };

    insertCard(db, card1);
    insertCard(db, card2);

    // Filter by category
    const progCards = queryCards(db, { category: 'programming' });
    expect(progCards.length).toBe(1);
    expect(progCards[0].title).toBe('Programming Card');

    // Filter by keyword
    const mathCards = queryCards(db, { keyword: 'math' });
    expect(mathCards.length).toBe(1);
    expect(mathCards[0].title).toBe('Academic Card');

    // All active cards
    const allCards = queryCards(db, {});
    expect(allCards.length).toBe(2);
  });

  it('should reject invalid category', () => {
    const cardInput = {
      id: 'kb-20260304-0005',
      title: 'Bad Category',
      category: 'invalid-category' as any,
      tags: [],
      brief: 'brief',
      detail: 'detail',
      feynman_seed: 'seed'
    };

    expect(() => insertCard(db, cardInput)).toThrow('Invalid category');
  });
});

// ---- Task 4: 新增查询函数测试 ----
import { getDueCards, updateSchedule, addReviewRecord, addNegativeFeedback, getStatsSummary } from '../../db/queries';
import { ScheduleUpdate, ReviewRecord, NegativeFeedbackInput } from '../../db/types';

function makeCard(id: string): CardInput {
  return {
    id, title: 'Test Card', category: 'programming',
    tags: ['test'], brief: 'brief', detail: 'detail', feynman_seed: 'seed',
  };
}

describe('getDueCards', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('returns cards with next_review_date <= today', () => {
    insertCard(db, makeCard('kb-due-01'));
    insertCard(db, makeCard('kb-due-02'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-10', 'kb-due-01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-20', 'kb-due-02');

    const due = getDueCards(db, '2026-03-12');
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('kb-due-01');
    expect(due[0]).toHaveProperty('category');
    expect(due[0]).toHaveProperty('last_rating');
    expect(due[0]).toHaveProperty('review_count');
  });

  it('excludes deleted cards', () => {
    insertCard(db, makeCard('kb-due-del'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-10', 'kb-due-del');
    softDeleteCard(db, 'kb-due-del');
    const due = getDueCards(db, '2026-03-12');
    expect(due.find(c => c.id === 'kb-due-del')).toBeUndefined();
  });
});

describe('updateSchedule', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('updates schedule fields', () => {
    insertCard(db, makeCard('kb-sched-01'));
    const update: ScheduleUpdate = {
      ef: 2.6, interval_days: 3, next_review_date: '2026-03-15',
      review_count: 1, consecutive_correct: 1,
      last_rating: '会', last_review_at: '2026-03-12T10:00:00Z',
    };
    updateSchedule(db, 'kb-sched-01', update);
    const card = getCardById(db, 'kb-sched-01');
    expect(card!.schedule.ef).toBe(2.6);
    expect(card!.schedule.next_review_date).toBe('2026-03-15');
  });
});

describe('addReviewRecord', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('inserts review history entry', () => {
    insertCard(db, makeCard('kb-rev-01'));
    addReviewRecord(db, {
      card_id: 'kb-rev-01', reviewed_at: '2026-03-12T10:00:00Z',
      rating: '会', session_notes: 'Good',
    });
    const card = getCardById(db, 'kb-rev-01');
    expect(card!.review_history.length).toBe(1);
    expect(card!.review_history[0].rating).toBe('会');
  });
});

describe('addNegativeFeedback', () => {
  let db: Database;
  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('inserts negative feedback entry', () => {
    addNegativeFeedback(db, {
      card_id: 'kb-neg-01', original_title: 'Test',
      extracted_content: 'content', deleted_at: '2026-03-12T10:00:00Z',
    });
    const row = db.prepare('SELECT * FROM negative_feedback WHERE card_id = ?').get('kb-neg-01') as any;
    expect(row.original_title).toBe('Test');
  });
});

describe('getStatsSummary', () => {
  it('returns correct counts', () => {
    const freshDb = initDatabase(':memory:');
    insertCard(freshDb, makeCard('kb-stat-01'));
    insertCard(freshDb, makeCard('kb-stat-02'));
    freshDb.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-12', 'kb-stat-01');
    freshDb.prepare('UPDATE card_schedule SET consecutive_correct = ?, next_review_date = ? WHERE card_id = ?').run(3, '2026-03-20', 'kb-stat-02');

    const stats = getStatsSummary(freshDb, '2026-03-12');
    expect(stats.totalCards).toBe(2);
    expect(stats.masteredCards).toBe(1);
    expect(stats.dueToday).toBe(1);
    freshDb.close();
  });
});
