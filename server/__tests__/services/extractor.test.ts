import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  scanNewSessionMessages,
  readFullSession,
  startExtractTimer,
  stopExtractTimer,
  restartExtractTimer,
} from '../../services/extractor';

// =========================================
// 辅助函数
// =========================================
function writeJsonl(dir: string, filename: string, entries: any[]): void {
  fs.writeFileSync(path.join(dir, filename), entries.map(e => JSON.stringify(e)).join('\n'));
}

function makeMessage(timestamp: string, role: string, text: string): any {
  return {
    type: 'message',
    timestamp,
    message: { role, content: [{ type: 'text', text }] },
  };
}

// =========================================
// 1. scanNewSessionMessages
// =========================================
describe('scanNewSessionMessages', () => {
  const testDir = path.join(os.tmpdir(), 'kb-scan-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('解析 JSONL 并提取 since 之后的消息', () => {
    writeJsonl(mainSessions, 'sess-1.jsonl', [
      { type: 'session', id: 'sess-1', timestamp: '2026-03-12T10:00:00Z' },
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Hello'),
      makeMessage('2026-03-12T10:02:00Z', 'assistant', 'Hi there'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T09:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].sessionId).toBe('main/sess-1');
    expect(chunks[0].content).toContain('[user]: Hello');
    expect(chunks[0].content).toContain('[assistant]: Hi there');
  });

  it('过滤 since 之前的消息', () => {
    writeJsonl(mainSessions, 'sess-2.jsonl', [
      makeMessage('2026-03-11T10:00:00Z', 'user', 'Old'),
      makeMessage('2026-03-12T10:01:00Z', 'user', 'New'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks[0].content).toContain('New');
    expect(chunks[0].content).not.toContain('Old');
  });

  it('since 恰好等于消息时间 → 不包含（严格大于）', () => {
    writeJsonl(mainSessions, 'sess-exact.jsonl', [
      makeMessage('2026-03-12T10:00:00Z', 'user', 'Exact time'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T10:00:00Z', testDir);
    expect(chunks.length).toBe(0);
  });

  it('since 比消息早 1 毫秒 → 包含', () => {
    writeJsonl(mainSessions, 'sess-ms.jsonl', [
      makeMessage('2026-03-12T10:00:00.001Z', 'user', 'Just after'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T10:00:00.000Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Just after');
  });

  it('目录不存在时返回空数组', () => {
    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', '/nonexistent/path');
    expect(chunks).toEqual([]);
  });

  it('没有新消息时返回空数组', () => {
    writeJsonl(mainSessions, 'sess-old.jsonl', [
      makeMessage('2026-03-10T10:00:00Z', 'user', 'Old'),
    ]);
    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks).toEqual([]);
  });

  it('扫描多个 agent（main + client）', () => {
    const clientSessions = path.join(testDir, 'client', 'sessions');
    fs.mkdirSync(clientSessions, { recursive: true });

    writeJsonl(mainSessions, 'sess-m.jsonl', [
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Main msg'),
    ]);
    writeJsonl(clientSessions, 'sess-c.jsonl', [
      makeMessage('2026-03-12T10:02:00Z', 'user', 'Client msg'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(2);
    expect(chunks.some(c => c.sessionId === 'main/sess-m')).toBe(true);
    expect(chunks.some(c => c.sessionId === 'client/sess-c')).toBe(true);
  });

  it('多 session 文件同时扫描', () => {
    writeJsonl(mainSessions, 'sess-a.jsonl', [
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Session A'),
    ]);
    writeJsonl(mainSessions, 'sess-b.jsonl', [
      makeMessage('2026-03-12T10:02:00Z', 'user', 'Session B'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(2);
  });

  it('跳过非 .jsonl 文件', () => {
    writeJsonl(mainSessions, 'sess-ok.jsonl', [
      makeMessage('2026-03-12T10:01:00Z', 'user', 'OK'),
    ]);
    fs.writeFileSync(path.join(mainSessions, 'readme.txt'), 'not a session');
    fs.writeFileSync(path.join(mainSessions, 'data.json'), '{}');

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
  });

  it('空行和空白行不影响解析', () => {
    const content = [
      JSON.stringify(makeMessage('2026-03-12T10:01:00Z', 'user', 'Hello')),
      '',
      '   ',
      JSON.stringify(makeMessage('2026-03-12T10:02:00Z', 'assistant', 'Hi')),
    ].join('\n');
    fs.writeFileSync(path.join(mainSessions, 'sess-blank.jsonl'), content);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Hello');
    expect(chunks[0].content).toContain('Hi');
  });

  it('只有 type=session/event 的行 → 返回空', () => {
    writeJsonl(mainSessions, 'sess-no-msg.jsonl', [
      { type: 'session', id: 'sess-no-msg', timestamp: '2026-03-12T10:00:00Z' },
      { type: 'event', event: 'connect', timestamp: '2026-03-12T10:01:00Z' },
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(0);
  });

  it('消息 content 含多种类型 → 只提取 text', () => {
    writeJsonl(mainSessions, 'sess-multi.jsonl', [{
      type: 'message',
      timestamp: '2026-03-12T10:01:00Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'World' },
        ],
      },
    }]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks[0].content).toContain('Hello');
    expect(chunks[0].content).toContain('World');
    expect(chunks[0].content).not.toContain('base64');
  });

  it('格式异常的 JSON 行不中断解析', () => {
    const content = [
      JSON.stringify(makeMessage('2026-03-12T10:01:00Z', 'user', 'Good')),
      'not valid json',
      JSON.stringify(makeMessage('2026-03-12T10:02:00Z', 'assistant', 'Reply')),
    ].join('\n');
    fs.writeFileSync(path.join(mainSessions, 'sess-bad.jsonl'), content);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Good');
    expect(chunks[0].content).toContain('Reply');
  });

  it('跨天消息：精确过滤午夜边界', () => {
    writeJsonl(mainSessions, 'sess-midnight.jsonl', [
      makeMessage('2026-03-11T23:59:59Z', 'user', 'Before midnight'),
      makeMessage('2026-03-12T00:00:00Z', 'user', 'At midnight'),
      makeMessage('2026-03-12T00:00:01Z', 'user', 'After midnight'),
    ]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    // 严格大于 since → 不包含恰好等于的时间点
    expect(chunks[0].content).not.toContain('Before midnight');
    expect(chunks[0].content).not.toContain('At midnight');
    expect(chunks[0].content).toContain('After midnight');
  });

  it('content 为空文本时不产生消息', () => {
    writeJsonl(mainSessions, 'sess-empty-text.jsonl', [{
      type: 'message',
      timestamp: '2026-03-12T10:01:00Z',
      message: { role: 'user', content: [{ type: 'text', text: '' }] },
    }]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    // 空文本 text='' → 应被过滤（if (text) 为 false）
    expect(chunks.length).toBe(0);
  });

  it('消息无 content 字段不报错', () => {
    writeJsonl(mainSessions, 'sess-no-content.jsonl', [{
      type: 'message',
      timestamp: '2026-03-12T10:01:00Z',
      message: { role: 'user' },
    }]);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(0);
  });
});

// =========================================
// 2. readFullSession
// =========================================
describe('readFullSession', () => {
  const testDir = path.join(os.tmpdir(), 'kb-full-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('读取单个 session 的所有消息', () => {
    writeJsonl(mainSessions, 'sess-full.jsonl', [
      { type: 'session', id: 'sess-full', timestamp: '2026-03-12T10:00:00Z' },
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Hello'),
      makeMessage('2026-03-12T10:02:00Z', 'assistant', 'Hi there'),
      makeMessage('2026-03-12T10:03:00Z', 'user', 'Tell me about Go'),
    ]);

    const result = readFullSession('main/sess-full', testDir);
    expect(result).not.toBeNull();
    expect(result).toContain('[user]: Hello');
    expect(result).toContain('[assistant]: Hi there');
    expect(result).toContain('[user]: Tell me about Go');
  });

  it('不带 agent 前缀的 UUID 默认使用 main', () => {
    writeJsonl(mainSessions, 'sess-plain.jsonl', [
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Plain UUID'),
    ]);

    const result = readFullSession('sess-plain', testDir);
    expect(result).toContain('Plain UUID');
  });

  it('文件不存在时返回 null', () => {
    expect(readFullSession('main/nonexistent', testDir)).toBeNull();
  });

  it('session 无消息类型行时返回 null', () => {
    writeJsonl(mainSessions, 'sess-empty.jsonl', [
      { type: 'session', id: 'sess-empty', timestamp: '2026-03-12T10:00:00Z' },
    ]);

    expect(readFullSession('main/sess-empty', testDir)).toBeNull();
  });

  it('空文件返回 null', () => {
    fs.writeFileSync(path.join(mainSessions, 'empty.jsonl'), '');
    expect(readFullSession('main/empty', testDir)).toBeNull();
  });

  it('只有空白行返回 null', () => {
    fs.writeFileSync(path.join(mainSessions, 'ws.jsonl'), '   \n  \n  ');
    expect(readFullSession('main/ws', testDir)).toBeNull();
  });

  it('跳过格式异常行', () => {
    const content = [
      JSON.stringify(makeMessage('2026-03-12T10:01:00Z', 'user', 'Good')),
      'not valid json',
      JSON.stringify(makeMessage('2026-03-12T10:02:00Z', 'assistant', 'Reply')),
    ].join('\n');
    fs.writeFileSync(path.join(mainSessions, 'sess-bad.jsonl'), content);

    const result = readFullSession('main/sess-bad', testDir);
    expect(result).toContain('[user]: Good');
    expect(result).toContain('[assistant]: Reply');
  });

  it('不过滤时间 → 所有消息都包含', () => {
    writeJsonl(mainSessions, 'sess-all.jsonl', [
      makeMessage('2020-01-01T00:00:00Z', 'user', 'Very old'),
      makeMessage('2026-12-31T23:59:59Z', 'user', 'Very new'),
    ]);

    const result = readFullSession('main/sess-all', testDir);
    expect(result).toContain('Very old');
    expect(result).toContain('Very new');
  });

  it('大量消息不丢失', () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeMessage(
        `2026-03-12T10:${String(i).padStart(2, '0')}:00Z`,
        i % 2 === 0 ? 'user' : 'assistant',
        `Message ${i}`
      )
    );
    writeJsonl(mainSessions, 'big.jsonl', entries);

    const result = readFullSession('main/big', testDir);
    expect(result).toContain('Message 0');
    expect(result).toContain('Message 99');
  });

  it('支持 client agent 路径', () => {
    const clientSessions = path.join(testDir, 'client', 'sessions');
    fs.mkdirSync(clientSessions, { recursive: true });
    writeJsonl(clientSessions, 'sess-client.jsonl', [
      makeMessage('2026-03-12T10:01:00Z', 'user', 'Client message'),
    ]);

    const result = readFullSession('client/sess-client', testDir);
    expect(result).toContain('Client message');
  });
});

// =========================================
// 3. 定时器调度逻辑（scheduleExtract）
// =========================================
describe('定时提取调度逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopExtractTimer();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('extractIntervalMinutes=0 时不启动定时器', () => {
    vi.mock('../../utils/config', async (importOriginal) => {
      const actual = await importOriginal() as any;
      return {
        ...actual,
        readConfig: () => ({
          extractIntervalMinutes: 0,
          lastExtractTime: new Date(0).toISOString(),
          maxNegativeSamples: 50,
          categories: ['ai'],
          categoryColors: {},
          extractHistory: [],
        }),
      };
    });

    const onExtract = vi.fn().mockResolvedValue(undefined);
    startExtractTimer(onExtract);

    // 推进大量时间，不应触发
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(onExtract).not.toHaveBeenCalled();

    vi.unmock('../../utils/config');
  });

  it('stopExtractTimer 清理所有定时器', () => {
    const onExtract = vi.fn().mockResolvedValue(undefined);
    startExtractTimer(onExtract);
    stopExtractTimer();

    // 推进时间不应触发
    vi.advanceTimersByTime(60 * 60 * 1000);
    // 由于 config mock 可能已经触发了一次，我们验证 stop 后不再有新触发
    const callCount = onExtract.mock.calls.length;
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(onExtract.mock.calls.length).toBe(callCount);
  });

  it('restartExtractTimer 在无 onExtract 时不报错', () => {
    expect(() => restartExtractTimer()).not.toThrow();
  });
});
