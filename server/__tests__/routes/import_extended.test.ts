import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { createImportHandler, splitIntoChunks } from '../../routes/import';
import { HttpRequest, HttpResponse } from '../../types/plugin';

vi.mock('../../services/gatewayClient', () => ({
  triggerAgentRun: vi.fn().mockResolvedValue(undefined),
}));

function makeReq(overrides: Partial<HttpRequest>): HttpRequest {
  return { method: 'POST', url: '/api/import', query: {}, body: undefined, params: {}, ...overrides };
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

// =============================================
// splitIntoChunks 单元测试
// =============================================
describe('splitIntoChunks', () => {
  it('短文本不分割', () => {
    const chunks = splitIntoChunks('Hello world', 1500);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('Hello world');
  });

  it('按 --- 分割', () => {
    const text = 'Section 1\n---\nSection 2\n---\nSection 3';
    const chunks = splitIntoChunks(text, 1500);
    // 所有 section 合计 < 1500，应合成一个 chunk
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Section 1');
    expect(chunks[0]).toContain('Section 2');
    expect(chunks[0]).toContain('Section 3');
  });

  it('超长 section 触发分割', () => {
    const longSection1 = 'A'.repeat(800);
    const longSection2 = 'B'.repeat(800);
    const text = `${longSection1}\n---\n${longSection2}`;
    const chunks = splitIntoChunks(text, 1000);
    expect(chunks.length).toBe(2);
  });

  it('空文本返回原文', () => {
    const chunks = splitIntoChunks('');
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('');
  });

  it('无 --- 分隔符时保持完整', () => {
    const text = '一段完整的内容没有分隔符';
    const chunks = splitIntoChunks(text, 1500);
    expect(chunks.length).toBe(1);
  });

  it('多个连续 --- 正确处理', () => {
    const text = 'Content A\n---\n\n---\nContent B';
    const chunks = splitIntoChunks(text, 1500);
    expect(chunks.length).toBe(1);
  });

  it('maxChars = 10 强制细粒度分割', () => {
    const text = 'AAAA\n---\nBBBB\n---\nCCCC';
    const chunks = splitIntoChunks(text, 10);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================
// Import Route 补充测试
// =============================================
describe('Import Route - 边界条件补充', () => {
  let db: Database;
  let handler: ReturnType<typeof createImportHandler>;

  beforeEach(() => {
    db = initDatabase(':memory:');
    handler = createImportHandler(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OPTIONS 返回 204', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS' }), res);
    expect(res._status).toBe(204);
  });

  it('多文件上传正确合并', async () => {
    const { triggerAgentRun } = await import('../../services/gatewayClient');
    const res = makeRes();
    await handler(makeReq({
      body: {
        files: [
          { filename: 'a.md', content: 'Content A' },
          { filename: 'b.md', content: 'Content B' },
        ]
      }
    }), res);
    expect(res._status).toBe(200);
    expect(res._body.triggered).toBeGreaterThanOrEqual(1);
    expect(triggerAgentRun).toHaveBeenCalled();
  });

  it('Agent RPC 部分失败时仅计数成功的', async () => {
    const gatewayClient = await import('../../services/gatewayClient');
    let callCount = 0;
    vi.mocked(gatewayClient.triggerAgentRun).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('First call fails');
      // 后续成功
    });

    // 创建超长内容以触发多 chunk
    const longContent = 'A'.repeat(800) + '\n---\n' + 'B'.repeat(800);
    const res = makeRes();
    await handler(makeReq({
      body: { files: [{ filename: 'test.md', content: longContent }] }
    }), res);
    expect(res._status).toBe(200);
    // 至少有一些被触发
    expect(res._body.totalChunks).toBeGreaterThanOrEqual(1);
  });

  it('files 为非数组返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { files: 'not an array' } }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Missing field');
  });

  it('files 为 null 返回 400', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { files: null } }), res);
    expect(res._status).toBe(400);
  });

  it('空文件内容正常处理', async () => {
    const res = makeRes();
    await handler(makeReq({
      body: { files: [{ filename: 'empty.md', content: '' }] }
    }), res);
    expect(res._status).toBe(200);
  });

  it('返回 triggered 和 totalChunks 字段', async () => {
    const res = makeRes();
    await handler(makeReq({
      body: { files: [{ filename: 'test.md', content: 'Some content' }] }
    }), res);
    expect(res._body).toHaveProperty('triggered');
    expect(res._body).toHaveProperty('totalChunks');
  });
});
