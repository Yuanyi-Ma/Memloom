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

describe('Config Route - 边界条件补充', () => {
  const testDir = path.join(os.tmpdir(), 'kb-config-extended-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, '.memloom'), { recursive: true });
    fs.mkdirSync(path.join(testDir, '.openclaw'), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('OPTIONS 返回 204', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus } = mockReqRes('OPTIONS', '/api/config');
    await handler(req, res);
    expect(getStatus()).toBe(204);
  });

  it('GET /api/config/gateway-token 正常返回', async () => {
    const ocConfigPath = path.join(testDir, '.openclaw', 'openclaw.json');
    fs.writeFileSync(ocConfigPath, JSON.stringify({
      gateway: {
        port: 19999,
        auth: { token: 'test-token-123' },
      },
    }));

    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('GET', '/api/config/gateway-token');
    await handler(req, res);
    expect(getStatus()).toBe(200);
    const data = getData();
    expect(data.token).toBe('test-token-123');
    expect(data.port).toBe(19999);
  });

  it('GET /api/config/gateway-token 配置文件不存在返回 500', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('GET', '/api/config/gateway-token');
    await handler(req, res);
    expect(getStatus()).toBe(500);
    expect(getData().error).toBeDefined();
  });

  it('GET /api/config/gateway-token 缺少 gateway 配置时返回默认值', async () => {
    const ocConfigPath = path.join(testDir, '.openclaw', 'openclaw.json');
    fs.writeFileSync(ocConfigPath, JSON.stringify({}));

    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('GET', '/api/config/gateway-token');
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getData().token).toBe('');
    expect(getData().port).toBe(18789);
  });

  it('PUT /api/config 无效 body 返回 400', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('PUT', '/api/config', null);
    await handler(req, res);
    expect(getStatus()).toBe(400);
  });

  it('不支持的 HTTP 方法返回 405', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('DELETE', '/api/config');
    await handler(req, res);
    expect(getStatus()).toBe(405);
    expect(getData().error).toContain('Method not allowed');
  });

  it('PUT /api/config 更新分类和颜色', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('PUT', '/api/config', {
      categories: ['test', 'dev'],
      categoryColors: { test: 'red', dev: 'blue' },
    });
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getData().categories).toEqual(['test', 'dev']);
    expect(getData().categoryColors.test).toBe('red');
  });

  it('GET /api/config 无配置文件返回默认配置', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('GET', '/api/config');
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getData().categories).toContain('programming');
    expect(getData().extractIntervalMinutes).toBe(30);
  });

  it('PUT /api/config 更新 extractIntervalMinutes', async () => {
    const handler = createConfigHandler();
    const { req, res, getStatus, getData } = mockReqRes('PUT', '/api/config', {
      extractIntervalMinutes: 120,
      categories: ['test'],
      categoryColors: { test: 'red' },
    });
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getData().extractIntervalMinutes).toBe(120);
  });
});
