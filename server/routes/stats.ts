import { Database } from 'better-sqlite3';
import { HttpHandler, HttpRequest, HttpResponse } from '../types/plugin.js';
import { getStatsSummary, getHistoryStats } from '../db/queries.js';

export function createStatsHandler(db: Database): HttpHandler {
  return async (req: HttpRequest, res: HttpResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).json({}); return true; }
    
    // GET /api/stats/history
    if (req.method === 'GET' && req.url.includes('/history')) {
      try {
        const history = getHistoryStats(db);
        res.status(200).json(history);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
      return true;
    }

    // GET /api/stats (default)的概要统计
    const today = new Date().toISOString().slice(0, 10);
    try {
      const stats = getStatsSummary(db, today);
      res.status(200).json(stats);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
    return true;
  };
}
