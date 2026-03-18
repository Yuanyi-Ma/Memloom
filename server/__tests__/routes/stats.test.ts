import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard } from '../../db/queries';
import { createStatsHandler } from '../../routes/stats';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'GET', url: '/api/stats/summary', query: {}, body: undefined, params: {}, ...overrides };
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

describe('Stats Route', () => {
  let db: Database;
  let handler: ReturnType<typeof createStatsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createStatsHandler(db);
  });

  it('GET /api/stats/summary returns counts', async () => {
    insertCard(db, { id: 'kb-s01', title: 'T', category: 'programming', tags: [], brief: 'b', detail: 'd', feynman_seed: 's' });
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty('totalCards');
    expect(res._body).toHaveProperty('dueToday');
    expect(res._body).toHaveProperty('masteredCards');
    expect(res._body).toHaveProperty('newToday');
  });

  it('GET /api/stats/history returns 14 days of data', async () => {
    const res = makeRes();
    const req = makeReq({ url: '/api/stats/history' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toBeInstanceOf(Array);
    expect(res._body).toHaveLength(14);
    expect(res._body[0]).toHaveProperty('date');
    expect(res._body[0]).toHaveProperty('count');
  });
});
