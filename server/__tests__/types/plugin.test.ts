import { describe, it, expect } from 'vitest';
import type { OpenClawPluginApi, HttpRouteConfig, HttpRequest, HttpResponse } from '../../types/plugin';

describe('Plugin Types', () => {
  it('OpenClawPluginApi type is structurally valid', () => {
    // 类型级测试：确保接口可被实现
    const mockApi: OpenClawPluginApi = {
      config: {
        models: {
          providers: {
            'kimi-coding-new': { apiKey: 'test-key' },
          },
        },
      },
      registerHttpRoute: (_config: HttpRouteConfig) => {},
    };
    expect(mockApi.config.models?.providers?.['kimi-coding-new']?.apiKey).toBe('test-key');
    expect(typeof mockApi.registerHttpRoute).toBe('function');
  });

  it('HttpRequest has required properties', () => {
    const req: HttpRequest = {
      method: 'GET',
      url: '/api/cards',
      query: { status: 'active' },
      body: undefined,
      params: {},
    };
    expect(req.method).toBe('GET');
    expect(req.query.status).toBe('active');
  });

  it('HttpResponse has required methods', () => {
    let statusCode = 0;
    let responseBody = '';
    let headers: Record<string, string> = {};
    const res: HttpResponse = {
      status(code: number) { statusCode = code; return this; },
      json(data: unknown) { responseBody = JSON.stringify(data); },
      send(data: string) { responseBody = data; },
      setHeader(key: string, value: string) { headers[key] = value; },
      write(chunk: string) { responseBody += chunk; },
      end() {},
    };
    res.status(200).json({ ok: true });
    expect(statusCode).toBe(200);
    expect(responseBody).toBe('{"ok":true}');
  });
});
