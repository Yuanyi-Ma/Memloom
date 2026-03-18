import { readConfig, writeConfig, getDefaultConfig } from '../utils/config.js';
import { KBConfig } from '../db/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

type Req = { method: string; url: string; query: Record<string, string | undefined>; body?: any; params: Record<string, string> };
type Res = {
  status(code: number): Res;
  json(data: unknown): void;
  send(data: string): void;
  setHeader(key: string, value: string): void;
  write(chunk: string): void;
  end(): void;
};

export function createConfigHandler(): (req: Req, res: Res) => Promise<boolean> | boolean {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).json({});
      return true;
    }

    const urlPath = req.url.replace(/\?.*$/, '');

    // GET /api/config/gateway-token — 前端用于连接 Gateway WS
    if (req.method === 'GET' && urlPath.endsWith('/gateway-token')) {
      try {
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        if (!fs.existsSync(configPath)) {
          res.status(500).json({ error: 'OpenClaw config not found' });
          return true;
        }
        const ocConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        res.status(200).json({
          token: ocConfig.gateway?.auth?.token || '',
          port: ocConfig.gateway?.port || 18789,
        });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
      return true;
    }

    // GET /api/config/categories
    if (req.method === 'GET' && urlPath.endsWith('/categories')) {
      const config = readConfig();
      res.status(200).json({
        categories: config.categories,
        colors: config.categoryColors,
      });
      return true;
    }

    // GET /api/config
    if (req.method === 'GET') {
      const config = readConfig();
      res.status(200).json(config);
      return true;
    }

    // PUT /api/config
    if (req.method === 'PUT') {
      const body = req.body as Partial<KBConfig>;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid request body' });
        return true;
      }

      const current = readConfig();
      const updated: KBConfig = {
        ...current,
        ...body,
      };

      // 校验：至少保留一个分类
      if (updated.categories.length === 0) {
        res.status(400).json({ error: 'At least one category is required' });
        return true;
      }

      writeConfig(updated);
      res.status(200).json(updated);
      return true;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return true;
  };
}

