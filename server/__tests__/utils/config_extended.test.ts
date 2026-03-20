import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readConfig, writeConfig, updateLastExtractTime, getCategories, getDefaultConfig } from '../../utils/config';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Config Management - 边界条件补充', () => {
  const testDir = path.join(os.tmpdir(), 'kb-config-ext-' + Date.now());
  const configPath = path.join(testDir, '.memloom', 'config.json');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('损坏 JSON 文件回退到默认配置', () => {
    fs.writeFileSync(configPath, 'this is not valid json {{{');
    const config = readConfig();
    expect(config.extractIntervalMinutes).toBe(30);
    expect(config.categories).toContain('ai');
  });

  it('updateLastExtractTime 不传参使用当前时间', () => {
    const before = new Date().toISOString();
    updateLastExtractTime();
    const after = new Date().toISOString();
    const config = readConfig();
    expect(config.lastExtractTime >= before).toBe(true);
    expect(config.lastExtractTime <= after).toBe(true);
  });

  it('部分配置文件与默认配置合并', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      extractIntervalMinutes: 99,
    }));
    const config = readConfig();
    expect(config.extractIntervalMinutes).toBe(99);
    // 未指定的字段应使用默认值
    expect(config.categories).toContain('ai');
    expect(config.maxNegativeSamples).toBe(50);
  });

  it('空对象配置文件使用所有默认值', () => {
    fs.writeFileSync(configPath, '{}');
    const config = readConfig();
    expect(config.extractIntervalMinutes).toBe(30);
  });

  it('getDefaultConfig 返回独立副本（对象级别浅复制）', () => {
    const def1 = getDefaultConfig();
    const def2 = getDefaultConfig();
    // 注：当前实现使用 spread 浅复制，categories 数组是同一引用
    // 这验证了当前行为（共享引用），但可能是潜在的 bug
    expect(def1).not.toBe(def2); // 对象本身是不同的
    expect(def1.extractIntervalMinutes).toBe(def2.extractIntervalMinutes);
  });

  it('writeConfig 后文件可被 JSON.parse', () => {
    const config = getDefaultConfig();
    config.extractIntervalMinutes = 42;
    writeConfig(config);
    const raw = fs.readFileSync(configPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw).extractIntervalMinutes).toBe(42);
  });

  it('readConfig 的 categoryColors 默认包含所有默认分类', () => {
    const config = readConfig();
    expect(config.categoryColors).toHaveProperty('ai');
    expect(config.categoryColors).toHaveProperty('computer-science');
    expect(config.categoryColors).toHaveProperty('blockchain');
    expect(config.categoryColors).toHaveProperty('general');
  });
});
