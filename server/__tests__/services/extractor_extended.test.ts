import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scanNewSessionMessages, readFullSession } from '../../services/extractor';

describe('Extractor - 边界条件补充', () => {
  const testDir = path.join(os.tmpdir(), 'kb-extractor-ext-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('多 session 文件同时扫描', () => {
    fs.writeFileSync(
      path.join(mainSessions, 'sess-a.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Session A message' }] } })
    );
    fs.writeFileSync(
      path.join(mainSessions, 'sess-b.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Session B message' }] } })
    );

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(2);
    expect(chunks.some(c => c.sessionId === 'main/sess-a')).toBe(true);
    expect(chunks.some(c => c.sessionId === 'main/sess-b')).toBe(true);
  });

  it('session 文件包含空行不影响解析', () => {
    const lines = [
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } }),
      '',
      '   ',
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-empty-lines.jsonl'), lines.join('\n'));

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Hello');
    expect(chunks[0].content).toContain('Hi');
  });

  it('目录中有非 .jsonl 文件不影响扫描', () => {
    fs.writeFileSync(
      path.join(mainSessions, 'sess-ok.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'OK' }] } })
    );
    fs.writeFileSync(path.join(mainSessions, 'readme.txt'), 'not a session file');
    fs.writeFileSync(path.join(mainSessions, 'data.json'), '{}');

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].sessionId).toBe('main/sess-ok');
  });

  it('since 恰好等于消息时间 → 不包含（<= 过滤）', () => {
    fs.writeFileSync(
      path.join(mainSessions, 'sess-exact.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Exact time' }] } })
    );

    const chunks = scanNewSessionMessages('2026-03-12T10:00:00Z', testDir);
    expect(chunks.length).toBe(0);
  });

  it('只有 type=session 和 type=event 的行，无 type=message → 返回空', () => {
    const lines = [
      JSON.stringify({ type: 'session', id: 'sess-no-msg', timestamp: '2026-03-12T10:00:00Z' }),
      JSON.stringify({ type: 'event', event: 'connect', timestamp: '2026-03-12T10:01:00Z' }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-no-msg.jsonl'), lines.join('\n'));

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(0);
  });

  it('消息 content 包含多个 type 只提取 text', () => {
    const line = JSON.stringify({
      type: 'message',
      timestamp: '2026-03-12T10:01:00Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'World' },
        ]
      }
    });
    fs.writeFileSync(path.join(mainSessions, 'sess-multi-content.jsonl'), line);

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Hello');
    expect(chunks[0].content).toContain('World');
    expect(chunks[0].content).not.toContain('base64');
  });
});

describe('readFullSession - 边界条件补充', () => {
  const testDir = path.join(os.tmpdir(), 'kb-full-session-ext-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('空文件返回 null', () => {
    fs.writeFileSync(path.join(mainSessions, 'empty.jsonl'), '');
    const result = readFullSession('main/empty', testDir);
    expect(result).toBeNull();
  });

  it('只有空白行返回 null', () => {
    fs.writeFileSync(path.join(mainSessions, 'whitespace.jsonl'), '   \n  \n  ');
    const result = readFullSession('main/whitespace', testDir);
    expect(result).toBeNull();
  });

  it('大量消息不丢失', () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      JSON.stringify({
        type: 'message',
        timestamp: `2026-03-12T10:${String(i).padStart(2, '0')}:00Z`,
        message: { role: i % 2 === 0 ? 'user' : 'assistant', content: [{ type: 'text', text: `Message ${i}` }] }
      })
    );
    fs.writeFileSync(path.join(mainSessions, 'big-session.jsonl'), lines.join('\n'));

    const result = readFullSession('main/big-session', testDir);
    expect(result).not.toBeNull();
    expect(result).toContain('Message 0');
    expect(result).toContain('Message 99');
  });
});
