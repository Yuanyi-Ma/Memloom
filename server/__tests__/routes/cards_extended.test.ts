import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard } from '../../db/queries';
import { createCardsHandler } from '../../routes/cards';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';
import * as extractor from '../../services/extractor';

// Mock gateway client
vi.mock('../../services/gatewayClient', () => ({
  triggerAgentRun: vi.fn().mockResolvedValue(undefined),
}));

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'GET', url: '/api/cards', query: {}, body: undefined, params: {}, ...overrides };
}

function makeRes(): HttpResponse & { _status: number; _body: any } {
  const res: any = { _status: 0, _body: null, _headers: {} };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (data: any) => { res._body = data; };
  res.send = (data: string) => { res._body = data; };
  res.setHeader = (k: string, v: string) => { res._headers[k] = v; };
  res.write = () => {};
  res.end = () => {};
  return res;
}

function makeCard(id: string, overrides?: Partial<CardInput>): CardInput {
  return {
    id, title: 'Test', category: 'programming',
    tags: ['test'], brief: 'Brief', detail: 'Detail', feynman_seed: 'Q',
    ...overrides,
  };
}

describe('Cards Route - 边界条件补充', () => {
  let db: Database;
  let handler: ReturnType<typeof createCardsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createCardsHandler(db);
  });

  // --- OPTIONS ---
  it('OPTIONS 返回 204', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS', url: '/api/cards' }), res);
    expect(res._status).toBe(204);
  });

  // --- DELETE 不存在 ---
  it('DELETE 不存在的卡片返回 404', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', url: '/api/cards/nope', params: { id: 'nope' } }), res);
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Card not found');
  });

  // --- POST /ingest 错误 ---
  it('POST /api/cards/ingest 无 cards 字段返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', url: '/api/cards/ingest', body: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Missing field');
  });

  it('POST /api/cards/ingest cards 为非数组返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', url: '/api/cards/ingest', body: { cards: 'not-array' } }), res);
    expect(res._status).toBe(400);
  });

  it('POST /api/cards/ingest 空数组正常处理', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', url: '/api/cards/ingest', body: { cards: [] } }), res);
    expect(res._status).toBe(200);
    expect(res._body.ingested).toBe(0);
  });

  it('POST /api/cards/ingest 无效分类导致错误抛出', async () => {
    const res = makeRes();
    await expect(
      handler(makeReq({
        method: 'POST', url: '/api/cards/ingest',
        body: { cards: [{ title: 'T', category: 'invalid', tags: [], brief: 'B', detail: 'D' }] }
      }), res)
    ).rejects.toThrow('Invalid category');
  });

  // --- PATCH /schedule 错误 ---
  it('PATCH /api/cards/:id/schedule 无 rating 返回 400', async () => {
    insertCard(db, makeCard('kb-sch01'));
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-sch01/schedule',
      params: { id: 'kb-sch01' }, body: {}
    }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('rating');
  });

  it('PATCH /api/cards/:id/schedule 卡片不存在返回 404', async () => {
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/nonexist/schedule',
      params: { id: 'nonexist' }, body: { rating: '会' }
    }), res);
    expect(res._status).toBe(404);
  });

  it('PATCH /api/cards/:id/schedule 返回 mastered 字段', async () => {
    insertCard(db, makeCard('kb-sch02'));
    // 设置 consecutive_correct = 2，再评一次"会"应该变成 3 → mastered
    db.prepare('UPDATE card_schedule SET consecutive_correct = 2 WHERE card_id = ?').run('kb-sch02');
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-sch02/schedule',
      params: { id: 'kb-sch02' }, body: { rating: '会' }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.mastered).toBe(true);
    expect(res._body.consecutive_correct).toBe(3);
  });

  // --- PATCH /status 错误 ---
  it('PATCH /api/cards/:id/status 无 status 字段返回 400', async () => {
    insertCard(db, makeCard('kb-st01'));
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-st01/status',
      params: { id: 'kb-st01' }, body: {}
    }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('status');
  });

  it('PATCH /api/cards/:id/status 无 cardId 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards//status',
      params: {}, body: { status: 'active' }
    }), res);
    expect(res._status).toBe(400);
  });

  // --- PATCH /category ---
  it('PATCH /api/cards/:id/category 成功更新', async () => {
    insertCard(db, makeCard('kb-cat01'));
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-cat01/category',
      params: { id: 'kb-cat01' }, body: { category: 'academic' }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.category).toBe('academic');
  });

  it('PATCH /api/cards/:id/category 无 category 返回 400', async () => {
    insertCard(db, makeCard('kb-cat02'));
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-cat02/category',
      params: { id: 'kb-cat02' }, body: {}
    }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('category');
  });

  it('PATCH /api/cards/:id/category 无效分类返回 500', async () => {
    insertCard(db, makeCard('kb-cat03'));
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards/kb-cat03/category',
      params: { id: 'kb-cat03' }, body: { category: 'nonexistent-category' }
    }), res);
    expect(res._status).toBe(500);
  });

  it('PATCH /api/cards/:id/category 无 cardId 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({
      method: 'PATCH', url: '/api/cards//category',
      params: {}, body: { category: 'academic' }
    }), res);
    expect(res._status).toBe(400);
  });

  // --- 未匹配 ---
  it('未匹配的方法返回 false', async () => {
    const res = makeRes();
    const result = await handler(makeReq({ method: 'PUT', url: '/api/cards' }), res);
    expect(result).toBe(false);
  });

  // --- 列表查询参数 ---
  it('GET /api/cards?status=pending 按状态过滤', async () => {
    insertCard(db, makeCard('kb-list01', { status: 'pending' }));
    insertCard(db, makeCard('kb-list02'));
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards', query: { status: 'pending' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.cards.length).toBe(1);
    expect(res._body.cards[0].status).toBe('pending');
  });

  it('GET /api/cards?category=academic 按分类过滤', async () => {
    insertCard(db, makeCard('kb-list03', { category: 'academic' }));
    insertCard(db, makeCard('kb-list04', { category: 'programming' }));
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards', query: { category: 'academic' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.cards.length).toBe(1);
  });

  it('GET /api/cards?keyword=blockchain 按关键词过滤', async () => {
    insertCard(db, makeCard('kb-list05', { title: 'blockchain card', tags: ['crypto'] }));
    insertCard(db, makeCard('kb-list06', { title: 'other card', tags: ['general'] }));
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards', query: { keyword: 'blockchain' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.cards.length).toBe(1);
    expect(res._body.cards[0].id).toBe('kb-list05');
  });
});
