import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { createCardsHandler } from '../../routes/cards';
import { HttpRequest, HttpResponse } from '../../types/plugin';
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

describe('Skill Capture Integration (POST /api/capture) — V2.0', () => {
  let db: Database;
  let handler: ReturnType<typeof createCardsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createCardsHandler(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('full flow: session exists → triggers Agent RPC', async () => {
    vi.spyOn(extractor, 'readFullSession').mockReturnValue(
      '[user]: 请解释 Go 的 interface 设计思想\n\n[assistant]: Go 的 interface 采用隐式实现的鸭子类型...'
    );

    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: { session_id: 'integration-sess-1' } }),
      res
    );

    expect(res._status).toBe(200);
    expect(res._body.triggered).toBe(true);
  });

  it('session not found → triggered: false', async () => {
    vi.spyOn(extractor, 'readFullSession').mockReturnValue(null);

    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: { session_id: 'nonexistent' } }),
      res
    );
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ triggered: false, reason: 'no_content' });
  });

  it('returns 400 when session_id missing', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/api/capture', body: {} }),
      res
    );
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('session_id');
  });
});
