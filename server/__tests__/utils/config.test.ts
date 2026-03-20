import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readConfig, writeConfig, updateLastExtractTime, getCategories, getDefaultConfig } from '../../utils/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Config Management', () => {
  const testDir = path.join(os.tmpdir(), 'kb-test-config-' + Date.now());
  const configPath = path.join(testDir, '.memloom', 'config.json');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should return default config if not exists', () => {
    const config = readConfig();
    expect(config.extractIntervalMinutes).toBe(30);
    expect(config.categories).toContain('ai');
  });

  it('should support categoryColors in default config', () => {
    const config = readConfig();
    expect(config.categoryColors).toBeDefined();
    expect(config.categoryColors).toHaveProperty('ai');
  });

  it('should read after write consistent config', () => {
    const customConfig = {
      extractIntervalMinutes: 60,
      lastExtractTime: '2026-03-04T10:00:00.000Z',
      maxNegativeSamples: 100,
      categories: ['test'],
      categoryColors: { test: 'red' },
      extractHistory: [],
    };
    writeConfig(customConfig);
    const read = readConfig();
    expect(read).toEqual(customConfig);
  });

  it('should update lastExtractTime without touching other fields', () => {
    const initialConfig = readConfig();
    const newTime = '2026-03-05T10:00:00.000Z';
    updateLastExtractTime(newTime);
    const updatedConfig = readConfig();
    expect(updatedConfig.lastExtractTime).toBe(newTime);
    expect(updatedConfig.extractIntervalMinutes).toBe(initialConfig.extractIntervalMinutes);
  });

  it('getCategories returns categories from config', () => {
    const categories = getCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('getCategories reflects custom config', () => {
    const customConfig = {
      extractIntervalMinutes: 30,
      lastExtractTime: new Date(0).toISOString(),
      maxNegativeSamples: 50,
      categories: ['custom-a', 'custom-b'],
      categoryColors: { 'custom-a': 'red', 'custom-b': 'blue' },
      extractHistory: [],
    };
    writeConfig(customConfig);
    const categories = getCategories();
    expect(categories).toEqual(['custom-a', 'custom-b']);
  });

  it('getDefaultConfig returns full default config', () => {
    const def = getDefaultConfig();
    expect(def.categories).toContain('ai');
    expect(def.categoryColors).toHaveProperty('ai');
  });
});
