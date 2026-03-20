import { Database } from 'better-sqlite3';
import { HttpRequest, HttpResponse, HttpHandler } from '../types/plugin.js';
import { queryCards, getCardById, softDeleteCard, insertCard, addNegativeFeedback, updateSchedule, addReviewRecord, updateCardStatus, updateCardCategory, searchCardsByTitle } from '../db/queries.js';
import { normalizedSimilarity } from '../utils/similarity.js';
import { appendNegativeSample } from '../services/negativeSamples.js';
import { generateCardId } from '../utils/id.js';
import { CardInput } from '../db/types.js';
import { calculateNextSchedule } from '../services/scheduler.js';
import { readFullSession } from '../services/extractor.js';
import { triggerAgentRun } from '../services/gatewayClient.js';
import { getCategories } from '../utils/config.js';

export function createCardsHandler(db: Database): HttpHandler {
  return async (req: HttpRequest, res: HttpResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      res.status(204).json({});
      return true;
    }

    // POST /api/cards/ingest
    if (req.method === 'POST' && req.url.includes('/ingest')) {
      return handleIngest(db, req, res);
    }

    // POST /api/capture
    if (req.method === 'POST' && req.url.includes('/capture')) {
      return handleCapture(db, req, res);
    }

    // POST /api/cards/validate
    if (req.method === 'POST' && req.url.includes('/validate')) {
      return handleValidate(req, res);
    }

    // POST /api/cards/check-duplicate
    if (req.method === 'POST' && req.url.includes('/check-duplicate')) {
      return handleCheckDuplicate(db, req, res);
    }

    // PATCH /api/cards/:id/schedule
    if (req.method === 'PATCH' && req.url.includes('/schedule')) {
      return handleScheduleUpdate(db, req, res);
    }

    // PATCH /api/cards/:id/category
    if (req.method === 'PATCH' && req.url.includes('/category')) {
      return handleCategoryUpdate(db, req, res);
    }

    // PATCH /api/cards/:id/status
    if (req.method === 'PATCH' && req.url.includes('/status')) {
      return handleStatusUpdate(db, req, res);
    }

    // DELETE /api/cards/:id
    if (req.method === 'DELETE' && req.params.id) {
      return handleDelete(db, req, res);
    }

    // GET /api/cards/:id
    if (req.method === 'GET' && req.params.id) {
      return handleGetCard(db, req, res);
    }

    // GET /api/cards
    if (req.method === 'GET') {
      return handleListCards(db, req, res);
    }

    return false;
  };
}

function handleListCards(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const cards = queryCards(db, {
    status: req.query.status,
    category: req.query.category,
    keyword: req.query.keyword,
    type: req.query.type,
    sort: req.query.sort as 'created_at' | 'next_review_date' | undefined,
  });
  res.status(200).json({ cards });
  return true;
}

function handleGetCard(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const card = getCardById(db, req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return true; }
  res.status(200).json(card);
  return true;
}

function handleDelete(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const card = getCardById(db, req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return true; }
  softDeleteCard(db, req.params.id);
  addNegativeFeedback(db, {
    card_id: req.params.id, original_title: card.title,
    extracted_content: card.brief, deleted_at: new Date().toISOString(),
  });
  appendNegativeSample({
    card_id: req.params.id, title: card.title,
    brief: card.brief, deleted_at: new Date().toISOString(),
  });
  res.status(200).json({ success: true });
  return true;
}

function handleIngest(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const { cards } = req.body as { cards: any[] };
  if (!cards || !Array.isArray(cards)) {
    res.status(400).json({ error: 'Missing field: cards' }); return true;
  }
  const ingested: { title: string; brief: string }[] = [];
  const skipped: { title: string; reason: string }[] = [];
  for (const raw of cards) {
    // 服务端去重安全网
    const existing = searchCardsByTitle(db, raw.title);
    const tooSimilar = existing.find(e => {
      const a = e.title.toLowerCase().replace(/[\s\-_、，,]/g, '');
      const b = raw.title.toLowerCase().replace(/[\s\-_、，,]/g, '');
      return a.includes(b) || b.includes(a) || normalizedSimilarity(a, b) > 0.7;
    });
    if (tooSimilar) {
      skipped.push({ title: raw.title, reason: `与已有知识「${tooSimilar.title}」高度相似` });
      continue;
    }

    const id = generateCardId();
    const cardInput: CardInput = {
      id, title: raw.title, category: raw.category,
      tags: raw.tags || [], brief: raw.brief,
      detail: raw.detail, feynman_seed: raw.review_question || raw.feynman_seed || '',
      status: 'pending',
    };
    insertCard(db, cardInput);
    ingested.push({ title: raw.title, brief: raw.brief });
  }
  res.status(200).json({ ingested: ingested.length, skipped: skipped.length, cards: ingested, skippedCards: skipped });
  return true;
}

async function handleCapture(_db: Database, req: HttpRequest, res: HttpResponse): Promise<boolean> {
  const { session_id } = req.body as { session_id?: string };
  if (!session_id) {
    res.status(400).json({ error: 'Missing field: session_id' });
    return true;
  }

  const conversationText = readFullSession(session_id);
  if (!conversationText) {
    res.status(200).json({ triggered: false, reason: 'no_content' });
    return true;
  }

  try {
    await triggerAgentRun({
      sessionKey: `memloom-capture-${session_id}`,
      message: `请回顾以下对话记录并提取知识：\n\n${conversationText}`,
    });
    res.status(200).json({ triggered: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
  return true;
}

function handleScheduleUpdate(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const cardId = req.params.id;
  const { rating } = req.body as { rating: string };
  if (!rating) { res.status(400).json({ error: 'Missing field: rating' }); return true; }

  const card = getCardById(db, cardId);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return true; }

  const today = new Date().toISOString().slice(0, 10);
  const result = calculateNextSchedule(card.schedule, rating as any, today);

  updateSchedule(db, cardId, {
    ...result,
    last_rating: rating,
    last_review_at: new Date().toISOString(),
  });
  addReviewRecord(db, {
    card_id: cardId, reviewed_at: new Date().toISOString(), rating,
  });

  res.status(200).json({
    next_review_date: result.next_review_date, ef: result.ef,
    interval_days: result.interval_days,
    consecutive_correct: result.consecutive_correct,
    mastered: result.consecutive_correct >= 3,
  });
  return true;
}

function handleStatusUpdate(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const cardId = req.params.id;
  if (!cardId) {
    res.status(400).json({ error: 'Missing card id' });
    return true;
  }
  const body = (req.body || {}) as { status?: string };
  if (!body.status) {
    res.status(400).json({ error: 'Missing status field' });
    return true;
  }
  try {
    updateCardStatus(db, cardId, String(body.status));
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
  return true;
}

function handleCategoryUpdate(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const cardId = req.params.id;
  if (!cardId) {
    res.status(400).json({ error: 'Missing card id' });
    return true;
  }
  const body = (req.body || {}) as { category?: string };
  if (!body.category) {
    res.status(400).json({ error: 'Missing category field' });
    return true;
  }
  try {
    updateCardCategory(db, cardId, String(body.category));
    res.status(200).json({ success: true, category: body.category });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
  return true;
}
function handleValidate(req: HttpRequest, res: HttpResponse): boolean {
  const { card } = req.body as { card: any };
  if (!card) {
    res.status(400).json({ error: 'Missing field: card' });
    return true;
  }

  const errors: string[] = [];
  const cats = getCategories();

  if (!card.title || card.title.trim().length === 0) {
    errors.push('title 不能为空');
  } else if (card.title.length > 15) {
    errors.push(`title 超过 15 字限制（当前 ${card.title.length} 字）`);
  }

  if (!cats.includes(card.category)) {
    errors.push(`category 必须是 ${cats.join(' / ')} 之一，当前值「${card.category}」不合法`);
  }

  if (!card.brief || card.brief.trim().length === 0) {
    errors.push('brief 不能为空');
  } else if (card.brief.length > 100) {
    errors.push(`brief 超过 100 字限制（当前 ${card.brief.length} 字）`);
  }

  if (!card.detail || card.detail.trim().length === 0) {
    errors.push('detail 不能为空');
  } else if (card.detail.length < 150) {
    errors.push(`detail 不足 150 字（当前 ${card.detail.length} 字）`);
  } else if (card.detail.length > 300) {
    errors.push(`detail 超过 300 字限制（当前 ${card.detail.length} 字）`);
  }

  if (!card.review_question || card.review_question.trim().length === 0) {
    errors.push('review_question 不能为空');
  }

  if (errors.length > 0) {
    res.status(200).json({ valid: false, errors });
  } else {
    res.status(200).json({ valid: true });
  }
  return true;
}

function handleCheckDuplicate(db: Database, req: HttpRequest, res: HttpResponse): boolean {
  const { title } = req.body as { title: string };
  if (!title) {
    res.status(400).json({ error: 'Missing field: title' });
    return true;
  }

  const matches = searchCardsByTitle(db, title);
  if (matches.length === 0) {
    res.status(200).json({ duplicates: [], message: '未找到相似条目，可安全入库。' });
    return true;
  }

  const duplicates = matches.map((m, i) => ({
    index: i + 1,
    id: m.id,
    title: m.title,
    brief: m.brief,
    detail: m.detail,
  }));

  res.status(200).json({
    duplicates,
    message: `发现 ${matches.length} 条可能相似的已有知识，请对比内容决定是否跳过。`,
  });
  return true;
}
