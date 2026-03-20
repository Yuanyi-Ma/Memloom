import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard } from '../../db/queries';
import { createReviewHandler } from '../../routes/review';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';

vi.mock('../../services/gatewayClient', () => ({
  triggerAgentRun: vi.fn().mockResolvedValue('这是一个精彩的回答...'),
}));

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'POST', url: '/api/review', query: {}, body: undefined, params: {}, ...overrides };
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
    id, title: 'Test', category: 'ai',
    tags: ['test'], brief: 'Brief', detail: 'Detail', feynman_seed: 'Question',
    ...overrides,
  };
}

describe('Review Route - 边界条件补充', () => {
  let db: Database;
  let handler: ReturnType<typeof createReviewHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createReviewHandler(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OPTIONS 返回 204', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS' }), res);
    expect(res._status).toBe(204);
  });

  it('POST /api/review/start 按 category 过滤', async () => {
    insertCard(db, makeCard('kb-rev01', { category: 'ai' }));
    insertCard(db, makeCard('kb-rev02', { category: 'blockchain' }));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2020-01-01', 'kb-rev01');
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2020-01-01', 'kb-rev02');

    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/start',
      body: { category: 'ai' }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.queue).toContain('kb-rev01');
    expect(res._body.queue).not.toContain('kb-rev02');
  });

  it('POST /api/review/chat action=start 卡片不存在返回 404', async () => {
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { cardId: 'nonexistent', action: 'start' }
    }), res);
    expect(res._status).toBe(404);
  });

  it('POST /api/review/chat 缺少 cardId 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { userMessage: 'hello' }
    }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('cardId');
  });

  it('POST /api/review/chat 缺少 userMessage 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { cardId: 'kb-rev01' }
    }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('userMessage');
  });

  it('POST /api/review/chat Agent RPC 成功返回 agentTriggered: true', async () => {
    insertCard(db, makeCard('kb-rev03'));
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { cardId: 'kb-rev03', userMessage: '我认为这个概念是...' }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.agentTriggered).toBe(true);
  });

  it('POST /api/review/chat Agent RPC 失败返回 fallback 回复', async () => {
    const gatewayClient = await import('../../services/gatewayClient');
    vi.mocked(gatewayClient.triggerAgentRun).mockRejectedValueOnce(new Error('Connection failed'));

    insertCard(db, makeCard('kb-rev04'));
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { cardId: 'kb-rev04', userMessage: '我的回答是...' }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.agentTriggered).toBe(false);
    expect(res._body.reply).toBeDefined();
    expect(res._body.reply.length).toBeGreaterThan(0);
  });

  it('POST /api/review/chat 不存在的卡片返回 404（非 start action）', async () => {
    const res = makeRes();
    await handler(makeReq({
      url: '/api/review/chat',
      body: { cardId: 'ghost', userMessage: 'hello' }
    }), res);
    expect(res._status).toBe(404);
  });

  it('POST /api/review/start 默认 count 为 20', async () => {
    // 插入 25 张到期卡片
    for (let i = 0; i < 25; i++) {
      insertCard(db, makeCard(`kb-def-${i}`));
      db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2020-01-01', `kb-def-${i}`);
    }
    const res = makeRes();
    await handler(makeReq({ url: '/api/review/start', body: {} }), res);
    expect(res._body.queue.length).toBe(20);
    expect(res._body.total).toBe(20);
  });

  it('未匹配路由返回 false', async () => {
    const res = makeRes();
    const result = await handler(makeReq({ method: 'GET', url: '/api/review/unknown' }), res);
    expect(result).toBe(false);
  });
});
