import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard, getCardById } from '../../db/queries';
import { createStatsHandler } from '../../routes/stats';
import { HttpRequest, HttpResponse } from '../../types/plugin';
import { CardInput } from '../../db/types';

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'GET', url: '/api/stats', query: {}, body: undefined, params: {}, ...overrides };
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

describe('Stats Route - 边界条件补充', () => {
  let db: Database;
  let handler: ReturnType<typeof createStatsHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createStatsHandler(db);
  });

  it('OPTIONS 返回 204', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS' }), res);
    expect(res._status).toBe(204);
  });

  it('空数据库时所有计数为 0', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._status).toBe(200);
    expect(res._body.totalCards).toBe(0);
    expect(res._body.masteredCards).toBe(0);
    expect(res._body.dueToday).toBe(0);
    expect(res._body.newToday).toBe(0);
  });

  it('正确区分 mastered 和非 mastered', async () => {
    insertCard(db, { id: 'kb-st01', title: 'A', category: 'programming', tags: [], brief: 'b', detail: 'd', feynman_seed: 's' });
    insertCard(db, { id: 'kb-st02', title: 'B', category: 'programming', tags: [], brief: 'b', detail: 'd', feynman_seed: 's' });
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(3, 'kb-st01');
    db.prepare('UPDATE card_schedule SET consecutive_correct = ? WHERE card_id = ?').run(1, 'kb-st02');

    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._body.totalCards).toBe(2);
    expect(res._body.masteredCards).toBe(1);
  });

  it('删除的卡片不计入统计', async () => {
    insertCard(db, { id: 'kb-st03', title: 'Del', category: 'programming', tags: [], brief: 'b', detail: 'd', feynman_seed: 's' });
    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run('deleted', 'kb-st03');

    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._body.totalCards).toBe(0);
  });

  it('pending 卡片不计入 active 统计', async () => {
    insertCard(db, { id: 'kb-st04', title: 'Pending', category: 'programming', tags: [], brief: 'b', detail: 'd', feynman_seed: 's', status: 'pending' });

    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res._body.totalCards).toBe(0);
  });

  it('history 端点返回数组，每项都有 date 和 count', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/api/stats/history' }), res);
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body)).toBe(true);
    expect(res._body.length).toBe(14);
    res._body.forEach((item: any) => {
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('count');
      expect(typeof item.count).toBe('number');
    });
  });
});
