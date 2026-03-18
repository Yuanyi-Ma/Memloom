import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scanNewSessionMessages, readFullSession } from '../../services/extractor';

describe('Extractor - scanNewSessionMessages', () => {
  const testDir = path.join(os.tmpdir(), 'kb-sessions-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('parses session JSONL and extracts messages after since', () => {
    const lines = [
      JSON.stringify({ type: 'session', id: 'sess-1', timestamp: '2026-03-12T10:00:00Z' }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-1.jsonl'), lines.join('\n'));

    const chunks = scanNewSessionMessages('2026-03-12T09:00:00Z', testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].sessionId).toBe('main/sess-1');
    expect(chunks[0].content).toContain('[user]: Hello');
    expect(chunks[0].content).toContain('[assistant]: Hi there');
  });

  it('filters out messages before since timestamp', () => {
    const lines = [
      JSON.stringify({ type: 'message', timestamp: '2026-03-11T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Old' }] } }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'New' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-2.jsonl'), lines.join('\n'));

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks[0].content).toContain('New');
    expect(chunks[0].content).not.toContain('Old');
  });

  it('returns empty array when directory does not exist', () => {
    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', '/nonexistent/path');
    expect(chunks).toEqual([]);
  });

  it('returns empty when no new messages', () => {
    const lines = [
      JSON.stringify({ type: 'message', timestamp: '2026-03-10T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Old' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-3.jsonl'), lines.join('\n'));
    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks).toEqual([]);
  });

  it('scans multiple agents (main + client)', () => {
    const clientSessions = path.join(testDir, 'client', 'sessions');
    fs.mkdirSync(clientSessions, { recursive: true });

    fs.writeFileSync(
      path.join(mainSessions, 'sess-main.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Main msg' }] } })
    );
    fs.writeFileSync(
      path.join(clientSessions, 'sess-client.jsonl'),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Client msg' }] } })
    );

    const chunks = scanNewSessionMessages('2026-03-12T00:00:00Z', testDir);
    expect(chunks.length).toBe(2);
    expect(chunks.some(c => c.sessionId === 'main/sess-main')).toBe(true);
    expect(chunks.some(c => c.sessionId === 'client/sess-client')).toBe(true);
  });
});

describe('Extractor - readFullSession', () => {
  const testDir = path.join(os.tmpdir(), 'kb-full-session-' + Date.now());
  const mainSessions = path.join(testDir, 'main', 'sessions');

  beforeEach(() => { fs.mkdirSync(mainSessions, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('reads all messages from a single session file', () => {
    const lines = [
      JSON.stringify({ type: 'session', id: 'sess-full', timestamp: '2026-03-12T10:00:00Z' }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] } }),
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:03:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Tell me about Go' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-full.jsonl'), lines.join('\n'));

    const result = readFullSession('main/sess-full', testDir);
    expect(result).not.toBeNull();
    expect(result).toContain('[user]: Hello');
    expect(result).toContain('[assistant]: Hi there');
    expect(result).toContain('[user]: Tell me about Go');
  });

  it('supports plain uuid (defaults to main agent)', () => {
    const lines = [
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Plain UUID' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-plain.jsonl'), lines.join('\n'));

    const result = readFullSession('sess-plain', testDir);
    expect(result).toContain('Plain UUID');
  });

  it('returns null when session file does not exist', () => {
    const result = readFullSession('main/nonexistent', testDir);
    expect(result).toBeNull();
  });

  it('returns null when session has no messages', () => {
    const lines = [
      JSON.stringify({ type: 'session', id: 'sess-empty', timestamp: '2026-03-12T10:00:00Z' }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-empty.jsonl'), lines.join('\n'));

    const result = readFullSession('main/sess-empty', testDir);
    expect(result).toBeNull();
  });

  it('skips malformed lines', () => {
    const lines = [
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:01:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Good' }] } }),
      'not valid json',
      JSON.stringify({ type: 'message', timestamp: '2026-03-12T10:02:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Reply' }] } }),
    ];
    fs.writeFileSync(path.join(mainSessions, 'sess-malformed.jsonl'), lines.join('\n'));

    const result = readFullSession('main/sess-malformed', testDir);
    expect(result).toContain('[user]: Good');
    expect(result).toContain('[assistant]: Reply');
  });
});
