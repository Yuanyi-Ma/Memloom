import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { createImportHandler } from '../../routes/import';
import { HttpRequest, HttpResponse } from '../../types/plugin';

// Mock the gateway client (V2.0: no more llmClient)
vi.mock('../../services/gatewayClient', () => ({
  triggerAgentRun: vi.fn().mockResolvedValue(undefined),
}));

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'POST', url: '/api/import/markdown', query: {}, body: undefined, params: {}, ...overrides };
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

describe('Import Route (V2.0)', () => {
  let db: Database;
  let handler: ReturnType<typeof createImportHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createImportHandler(db);
  });

  it('POST with content triggers agent runs', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { files: [{ filename: 'a.md', content: 'Some knowledge content here' }] } }), res);
    expect(res._status).toBe(200);
    expect(res._body.triggered).toBeGreaterThanOrEqual(1);
  });

  it('POST without files returns 400', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Missing field');
  });
});
