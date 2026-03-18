import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard } from '../../db/queries';
import { createCardsHandler } from '../../routes/cards';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';
import * as extractor from '../../services/extractor';

// Mock the gateway client (V2.0: no more llmClient)
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
  res.write = (chunk: string) => {};
  res.end = () => {};
  return res;
}

function makeCard(id: string): CardInput {
  return {
    id, title: 'Test', category: 'programming',
    tags: ['test'], brief: 'Brief', detail: 'Detail',
    feynman_seed: 'Question',
  };
}

describe('Cards Route Handler', () => {
  let db: Database;
  let handler: ReturnType<typeof createCardsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createCardsHandler(db);
  });

  it('GET /api/cards returns card list', async () => {
    insertCard(db, makeCard('kb-001'));
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards' }), res);
    expect(res._status).toBe(200);
    expect(res._body.cards.length).toBe(1);
  });

  it('GET /api/cards/:id returns card detail', async () => {
    insertCard(db, makeCard('kb-002'));
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards/kb-002', params: { id: 'kb-002' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.id).toBe('kb-002');
  });

  it('GET /api/cards/:id with nonexistent id returns 404', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET', url: '/api/cards/nope', params: { id: 'nope' } }), res);
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('Card not found');
  });

  it('DELETE /api/cards/:id soft deletes', async () => {
    insertCard(db, makeCard('kb-003'));
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', url: '/api/cards/kb-003', params: { id: 'kb-003' } }), res);
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
  });

  it('POST /api/cards/ingest ingests cards', async () => {
    const body = { cards: [{ title: 'T1', category: 'programming', tags: ['a'], brief: 'B', detail: 'D', review_question: 'Q' }] };
    const res = makeRes();
    await handler(makeReq({ method: 'POST', url: '/api/cards/ingest', body }), res);
    expect(res._status).toBe(200);
    expect(res._body.ingested).toBe(1);
  });

  it('PATCH /api/cards/:id/schedule updates schedule', async () => {
    insertCard(db, makeCard('kb-004'));
    const res = makeRes();
    await handler(makeReq({ method: 'PATCH', url: '/api/cards/kb-004/schedule', params: { id: 'kb-004' }, body: { rating: '会' } }), res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty('next_review_date');
    expect(res._body).toHaveProperty('ef');
  });
});

describe('POST /api/capture (V2.0: Agent RPC)', () => {
  let db: Database;
  let handler: ReturnType<typeof createCardsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createCardsHandler(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns triggered:false when session not found', async () => {
    vi.spyOn(extractor, 'readFullSession').mockReturnValue(null);
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: { session_id: 'nonexistent' } }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ triggered: false, reason: 'no_content' });
  });

  it('triggers agent run when session has content', async () => {
    vi.spyOn(extractor, 'readFullSession').mockReturnValue('[user]: Tell me about Go');
    const { triggerAgentRun } = await import('../../services/gatewayClient');
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: { session_id: 'sess-1' } }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body.triggered).toBe(true);
    expect(triggerAgentRun).toHaveBeenCalled();
  });

  it('returns 400 when session_id is missing', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: {} }),
      res
    );
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('session_id');
  });

  it('returns 500 when triggerAgentRun fails', async () => {
    vi.spyOn(extractor, 'readFullSession').mockReturnValue('[user]: Something');
    const gatewayClient = await import('../../services/gatewayClient');
    vi.mocked(gatewayClient.triggerAgentRun).mockRejectedValueOnce(new Error('Gateway timeout'));
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: { session_id: 'sess-3' } }),
      res
    );
    expect(res._status).toBe(500);
    expect(res._body.error).toContain('Gateway timeout');
  });
});

describe('PATCH /api/cards/:id/status', () => {
  let db: Database;
  let handler: ReturnType<typeof createCardsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createCardsHandler(db);
    insertCard(db, {
      id: 'kb-stat', title: 'Test', category: 'programming', tags: [],
      brief: 'Brief', detail: 'Detail', feynman_seed: 'Seed', status: 'pending'
    });
  });

  it('updates card status', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'PATCH', url: '/api/cards/kb-stat/status', params: { id: 'kb-stat' }, body: { status: 'active' } }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);

    const check = db.prepare('SELECT status FROM cards WHERE id = ?').get('kb-stat') as any;
    expect(check.status).toBe('active');
  });
});
