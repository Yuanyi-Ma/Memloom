import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { appendNegativeSample, readNegativeSamples, NegSampleFileEntry } from '../../services/negativeSamples';

describe('Negative Samples JSONL', () => {
  const testDir = path.join(os.tmpdir(), 'kb-neg-test-' + Date.now());
  const testFile = path.join(testDir, 'negative_samples.jsonl');

  beforeEach(() => { fs.mkdirSync(testDir, { recursive: true }); });
  afterEach(() => { fs.rmSync(testDir, { recursive: true, force: true }); });

  it('appendNegativeSample creates file and appends entry', () => {
    appendNegativeSample({ card_id: 'kb-001', title: 'Docker', brief: '端口映射', deleted_at: '2026-03-12' }, testFile);
    const parsed = JSON.parse(fs.readFileSync(testFile, 'utf-8').trim());
    expect(parsed.card_id).toBe('kb-001');
  });

  it('readNegativeSamples returns latest N entries (newest first)', () => {
    for (let i = 0; i < 10; i++)
      appendNegativeSample({ card_id: `kb-${i}`, title: `Card ${i}`, brief: `B`, deleted_at: '2026-03-12' }, testFile);
    const samples = readNegativeSamples(5, testFile);
    expect(samples.length).toBe(5);
    expect(samples[0].title).toBe('Card 9');
  });

  it('readNegativeSamples on missing file returns empty', () => {
    expect(readNegativeSamples(5, path.join(testDir, 'x.jsonl'))).toEqual([]);
  });

  it('readNegativeSamples skips malformed lines', () => {
    fs.writeFileSync(testFile, '{"card_id":"a","title":"A","brief":"B","deleted_at":"x"}\nnot json\n');
    expect(readNegativeSamples(10, testFile).length).toBe(1);
  });
});
