import { Database } from 'better-sqlite3';
import { CardInput, CardSummary, CardDetail, CardFilters, ScheduleUpdate, ReviewRecord, ReviewHistoryItem, NegativeFeedbackInput, StatsSummary } from './types.js';
import { getCategories } from '../utils/config.js';

export function insertCard(db: Database, input: CardInput): void {
  const categories = getCategories();
  if (!categories.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }

  const now = new Date().toISOString();
  // Assume markdown logic creates the file, db just logs it
  const filePath = `${input.category}/${input.id}.md`;
  const nextReviewDate = now.slice(0, 10); // Today

  const insertCardStmt = db.prepare(`
    INSERT INTO cards (id, title, category, tags, status, priority, brief, detail, feynman_seed, file_path, created_at, updated_at, source_session)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertScheduleStmt = db.prepare(`
    INSERT INTO card_schedule (card_id, ef, interval_days, next_review_date, review_count, consecutive_correct, last_rating, last_review_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertCardStmt.run(
      input.id, input.title, input.category, JSON.stringify(input.tags), 
      input.status || 'active', 'normal', input.brief, input.detail || '', input.feynman_seed || '',
      filePath, now, now, input.source_session || null
    );
    insertScheduleStmt.run(input.id, 2.5, 1, nextReviewDate, 0, 0, null, null);
  });

  transaction();
}

export function getCardById(db: Database, id: string): CardDetail | null {
  const cardRow = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as any;
  if (!cardRow) return null;

  const scheduleRow = db.prepare('SELECT * FROM card_schedule WHERE card_id = ?').get(id) as any;
  const historyRows = db.prepare('SELECT * FROM review_history WHERE card_id = ? ORDER BY reviewed_at DESC').all(id) as any[];

  return {
    id: cardRow.id,
    title: cardRow.title,
    category: cardRow.category,
    tags: JSON.parse(cardRow.tags || '[]'),
    brief: cardRow.brief,
    status: cardRow.status,
    created_at: cardRow.created_at,
    detail: cardRow.detail || '',
    feynman_seed: cardRow.feynman_seed || '',
    priority: cardRow.priority,
    schedule: scheduleRow,
    review_history: historyRows
  };
}

export function softDeleteCard(db: Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cards SET status = ?, updated_at = ? WHERE id = ?').run('deleted', now, id);
}

export function queryCards(db: Database, filters: CardFilters): CardSummary[] {
  let query = `
    SELECT c.*, cs.consecutive_correct, cs.next_review_date 
    FROM cards c 
    LEFT JOIN card_schedule cs ON cs.card_id = c.id 
    WHERE 1=1
  `;
  const params: any[] = [];

  // Default to active cards only
  if (filters.status) {
    query += ' AND c.status = ?';
    params.push(filters.status);
  } else {
    query += " AND c.status = 'active'";
  }
  
  if (filters.category) {
    query += ' AND c.category = ?';
    params.push(filters.category);
  }
  
  if (filters.keyword) {
    query += ' AND (c.title LIKE ? OR c.brief LIKE ? OR c.tags LIKE ?)';
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw, kw);
  }

  if (filters.type === 'mastered') {
    query += ' AND cs.consecutive_correct >= 3';
  } else if (filters.type === 'due') {
    const today = new Date().toISOString().slice(0, 10);
    query += ' AND cs.next_review_date <= ?';
    params.push(today);
  }

  if (filters.sort === 'next_review_date') {
    query += ' ORDER BY cs.next_review_date ASC';
  } else {
    query += ' ORDER BY c.created_at DESC';
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    tags: JSON.parse(r.tags || '[]'),
    brief: r.brief,
    status: r.status,
    created_at: r.created_at,
    schedule: (r.consecutive_correct !== null && r.next_review_date !== null) ? {
      consecutive_correct: r.consecutive_correct,
      next_review_date: r.next_review_date
    } : undefined
  }));
}

export interface DueCardRow {
  id: string;
  category: string;
  last_rating: string | null;
  review_count: number;
  next_review_date: string;
}

export function getDueCards(db: Database, today: string): DueCardRow[] {
  return db.prepare(`
    SELECT c.id, c.category, cs.last_rating, cs.review_count, cs.next_review_date
    FROM cards c JOIN card_schedule cs ON cs.card_id = c.id
    WHERE c.status = 'active' AND cs.next_review_date <= ?
    ORDER BY cs.next_review_date ASC
  `).all(today) as DueCardRow[];
}

export function updateSchedule(db: Database, cardId: string, update: ScheduleUpdate): void {
  db.prepare(`
    UPDATE card_schedule
    SET ef = ?, interval_days = ?, next_review_date = ?,
        review_count = ?, consecutive_correct = ?,
        last_rating = ?, last_review_at = ?
    WHERE card_id = ?
  `).run(update.ef, update.interval_days, update.next_review_date,
    update.review_count, update.consecutive_correct,
    update.last_rating, update.last_review_at, cardId);
}

export function addReviewRecord(db: Database, record: ReviewRecord): void {
  db.prepare(`
    INSERT INTO review_history (card_id, reviewed_at, rating, session_notes)
    VALUES (?, ?, ?, ?)
  `).run(record.card_id, record.reviewed_at, record.rating, record.session_notes || null);
}

export function addNegativeFeedback(db: Database, input: NegativeFeedbackInput): void {
  db.prepare(`
    INSERT INTO negative_feedback (card_id, original_title, extracted_content, deleted_at)
    VALUES (?, ?, ?, ?)
  `).run(input.card_id, input.original_title, input.extracted_content, input.deleted_at);
}

export function getStatsSummary(db: Database, today: string): StatsSummary {
  const totalCards = (db.prepare(
    'SELECT COUNT(*) as c FROM cards WHERE status = ?'
  ).get('active') as any).c;
  const masteredCards = (db.prepare(
    'SELECT COUNT(*) as c FROM cards c JOIN card_schedule cs ON cs.card_id = c.id WHERE c.status = ? AND cs.consecutive_correct >= 3'
  ).get('active') as any).c;
  const dueToday = (db.prepare(
    'SELECT COUNT(*) as c FROM cards c JOIN card_schedule cs ON cs.card_id = c.id WHERE c.status = ? AND cs.next_review_date <= ?'
  ).get('active', today) as any).c;
  const newToday = (db.prepare(
    "SELECT COUNT(*) as c FROM cards WHERE status = ? AND created_at >= ?"
  ).get('active', today + 'T00:00:00') as any).c;
  return { totalCards, masteredCards, dueToday, newToday };
}

export function updateCardStatus(db: Database, id: string, status: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE cards SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
}

export function updateCardCategory(db: Database, id: string, category: string): void {
  const categories = getCategories();
  if (!categories.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE cards SET category = ?, updated_at = ? WHERE id = ?').run(category, now, id);
}

export function getHistoryStats(db: Database): { date: string; count: number }[] {
  // 返回过去 14 天（按日期分组）的复习计数
  const rows = db.prepare(`
    SELECT "date"(reviewed_at) as date, COUNT(*) as count 
    FROM review_history 
    WHERE reviewed_at >= datetime('now', '-14 days')
    GROUP BY "date"(reviewed_at)
    ORDER BY date ASC
  `).all() as { date: string; count: number }[];
  
  // 补齐 14 天的空数据
  const result: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = rows.find(r => r.date === dateStr);
    result.push({ date: dateStr, count: found ? found.count : 0 });
  }
  return result;
}

export interface CardIndexEntry {
  id: string;
  title: string;
  brief_short: string;
}

/**
 * 轻量级知识索引：返回 title + brief 的前 40 字，用于 prompt 注入去重
 */
export function getCardIndex(db: Database): CardIndexEntry[] {
  const rows = db.prepare(`
    SELECT id, title, brief FROM cards WHERE status IN ('active', 'pending')
    ORDER BY created_at DESC
  `).all() as { id: string; title: string; brief: string }[];
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    brief_short: (r.brief || '').slice(0, 40),
  }));
}

export interface DuplicateCheckResult {
  id: string;
  title: string;
  brief: string;
  detail: string;
}

/**
 * 按关键词模糊匹配 title 和 brief，返回匹配卡片的全量信息，供 Agent 精确判断是否重复。
 * 自动将输入拆分为多个关键词（按空格/逗号/顿号分隔），任一关键词命中 title 或 brief 即返回。
 */
export function searchCardsByTitle(db: Database, keyword: string): DuplicateCheckResult[] {
  // 拆分关键词，过滤掉过短的词
  const keywords = keyword
    .split(/[\s、,，/]+/)
    .map(k => k.trim())
    .filter(k => k.length >= 2);

  if (keywords.length === 0) {
    // 回退：用原始关键词整体搜索
    const kw = `%${keyword}%`;
    return db.prepare(`
      SELECT id, title, brief, detail FROM cards
      WHERE status IN ('active', 'pending') AND (title LIKE ? OR brief LIKE ?)
      ORDER BY created_at DESC LIMIT 10
    `).all(kw, kw) as DuplicateCheckResult[];
  }

  // 每个关键词匹配 title 或 brief，用 OR 连接
  const conditions = keywords.map(() => '(title LIKE ? OR brief LIKE ?)').join(' OR ');
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  const rows = db.prepare(`
    SELECT id, title, brief, detail FROM cards
    WHERE status IN ('active', 'pending') AND (${conditions})
    ORDER BY created_at DESC LIMIT 10
  `).all(...params) as DuplicateCheckResult[];

  // 去重（多个关键词可能匹配到同一条目）
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

