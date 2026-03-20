import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard } from '../../db/queries';
import { createReviewHandler } from '../../routes/review';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';

vi.mock('../../services/gatewayClient', () => ({
  triggerAgentRun: vi.fn().mockResolvedValue(undefined),
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
  res.write = (chunk: string) => {};
  res.end = () => {};
  return res;
}

function makeCard(id: string): CardInput {
  return {
    id, title: 'Test', category: 'ai',
    tags: ['test'], brief: 'Brief', detail: 'Detail', feynman_seed: 'Question',
  };
}

describe('Review Route Handler', () => {
  let db: Database;
  let handler: ReturnType<typeof createReviewHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createReviewHandler(db);
  });

  it('POST /api/review/start returns queue', async () => {
    insertCard(db, makeCard('kb-r01'));
    db.prepare('UPDATE card_schedule SET next_review_date = ? WHERE card_id = ?').run('2026-03-10', 'kb-r01');
    const res = makeRes();
    await handler(makeReq({ url: '/api/review/start', body: { count: 10 } }), res);
    expect(res._status).toBe(200);
    expect(res._body.queue).toContain('kb-r01');
  });

  it('POST /api/review/start with no due cards returns empty', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/api/review/start', body: {} }), res);
    expect(res._body.queue).toEqual([]);
    expect(res._body.total).toBe(0);
  });

  it('POST /api/review/chat action=start initializes session', async () => {
    insertCard(db, makeCard('kb-r02'));
    const res = makeRes();
    await handler(makeReq({ url: '/api/review/chat', body: { cardId: 'kb-r02', action: 'start' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.cardId).toBe('kb-r02');
  });

  it('POST /api/review/chat with nonexistent card returns 404', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/api/review/chat', body: { cardId: 'no-card', userMessage: 'hi' } }), res);
    expect(res._status).toBe(404);
  });
});
