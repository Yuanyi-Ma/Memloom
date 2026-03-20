import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConfigHandler } from '../../routes/config';

function mockReqRes(method: string, url: string, body?: any) {
  let statusCode = 200;
  let responseData: any = null;
  const req = { method, url, query: {} as Record<string, string | undefined>, body, params: {} as Record<string, string> };
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: any) { responseData = data; },
    send(data: string) { responseData = data; },
    setHeader() {},
    write() {},
    end() {},
  };
  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

describe('Config Route', () => {
  const testDir = path.join(os.tmpdir(), 'kb-test-config-route-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.memloom'), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('GET /api/config returns config', async () => {
    const configPath = path.join(testDir, '.memloom', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      extractIntervalMinutes: 30,
      lastExtractTime: new Date(0).toISOString(),
      maxNegativeSamples: 50,
      categories: ['ai'],
      categoryColors: { ai: 'green' },
    }));

    const handler = createConfigHandler();
    const { req, res, getData } = mockReqRes('GET', '/api/config');
    await handler(req, res);

    const data = getData();
    expect(data.categories).toContain('ai');
    expect(data.extractIntervalMinutes).toBe(30);
  });

  it('PUT /api/config updates config', async () => {
    const handler = createConfigHandler();
    const newConfig = {
      extractIntervalMinutes: 60,
      categories: ['custom-a', 'custom-b'],
      categoryColors: { 'custom-a': 'red', 'custom-b': 'blue' },
    };
    const { req, res, getData } = mockReqRes('PUT', '/api/config', newConfig);
    await handler(req, res);

    const data = getData();
    expect(data.categories).toEqual(['custom-a', 'custom-b']);
  });

  it('PUT /api/config rejects empty categories', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('PUT', '/api/config', {
      categories: [],
      categoryColors: {},
    });
    await handler(req, res);

    expect(getStatus()).toBe(400);
    expect(getData().error).toContain('category');
  });

  it('GET /api/config/categories returns categories with colors', async () => {
    const handler = createConfigHandler();
    const { req, res, getData } = mockReqRes('GET', '/api/config/categories');
    req.url = '/api/config/categories';
    await handler(req, res);

    const data = getData();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.colors).toBeDefined();
  });
});
