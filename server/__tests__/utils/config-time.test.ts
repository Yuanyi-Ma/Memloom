import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readConfig, writeConfig, updateLastExtractTime, appendExtractHistory, getDefaultConfig } from '../../utils/config';

/**
 * Config 时间管理测试
 *
 * 注意：这些测试操作真实的 ~/.memloom/config.json 文件。
 * 为避免与运行中的服务冲突，使用 snapshot-restore 策略。
 */
describe('Config 时间管理', () => {
  const memloomDir = path.join(os.homedir(), '.memloom');
  const configPath = path.join(memloomDir, 'config.json');
  let snapshot: string | null = null;

  beforeEach(() => {
    // 拍摄快照
    if (fs.existsSync(configPath)) {
      snapshot = fs.readFileSync(configPath, 'utf-8');
    } else {
      snapshot = null;
    }
  });

  afterEach(() => {
    // 从快照恢复
    if (snapshot !== null) {
      fs.mkdirSync(memloomDir, { recursive: true });
      fs.writeFileSync(configPath, snapshot, 'utf-8');
    } else if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  // =========================================
  // getDefaultConfig (纯函数，不读文件)
  // =========================================
  describe('getDefaultConfig', () => {
    it('返回 extractIntervalMinutes=30', () => {
      const defaults = getDefaultConfig();
      expect(defaults.extractIntervalMinutes).toBe(30);
    });

    it('返回 epoch 时间的 lastExtractTime', () => {
      const defaults = getDefaultConfig();
      expect(defaults.lastExtractTime).toBe(new Date(0).toISOString());
    });

    it('返回 maxNegativeSamples=50', () => {
      expect(getDefaultConfig().maxNegativeSamples).toBe(50);
    });

    it('返回空的 extractHistory', () => {
      expect(getDefaultConfig().extractHistory).toEqual([]);
    });

    it('每次调用返回新对象（不共享引用）', () => {
      const a = getDefaultConfig();
      const b = getDefaultConfig();
      expect(a).not.toBe(b);
      a.extractIntervalMinutes = 999;
      expect(b.extractIntervalMinutes).toBe(30);
    });
  });

  // =========================================
  // readConfig/writeConfig 往返
  // =========================================
  describe('readConfig / writeConfig', () => {
    it('文件不存在时返回默认配置', () => {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      const config = readConfig();
      expect(config.extractIntervalMinutes).toBe(30);
    });

    it('文件损坏时返回默认配置', () => {
      fs.mkdirSync(memloomDir, { recursive: true });
      fs.writeFileSync(configPath, 'not valid json');
      const config = readConfig();
      expect(config.extractIntervalMinutes).toBe(30);
    });

    it('writeConfig → readConfig 往返一致', () => {
      const config = readConfig();
      config.extractIntervalMinutes = 42;
      config.lastExtractTime = '2026-06-01T00:00:00Z';
      writeConfig(config);

      const reloaded = readConfig();
      expect(reloaded.extractIntervalMinutes).toBe(42);
      expect(reloaded.lastExtractTime).toBe('2026-06-01T00:00:00Z');
    });
  });

  // =========================================
  // updateLastExtractTime
  // =========================================
  describe('updateLastExtractTime', () => {
    it('使用自定义时间字符串', () => {
      const time = '2026-03-12T10:30:00.000Z';
      updateLastExtractTime(time);
      expect(readConfig().lastExtractTime).toBe(time);
    });

    it('无参数时使用当前时间', () => {
      const before = new Date().toISOString();
      updateLastExtractTime();
      const after = new Date().toISOString();

      const lt = readConfig().lastExtractTime;
      expect(lt >= before).toBe(true);
      expect(lt <= after).toBe(true);
    });

    it('多次调用只保留最新值', () => {
      updateLastExtractTime('2026-01-01T00:00:00Z');
      updateLastExtractTime('2026-06-01T00:00:00Z');
      updateLastExtractTime('2026-12-31T23:59:59Z');
      expect(readConfig().lastExtractTime).toBe('2026-12-31T23:59:59Z');
    });

    it('不影响其他配置字段', () => {
      const config = readConfig();
      const origInterval = config.extractIntervalMinutes;
      updateLastExtractTime('2026-03-12T12:00:00Z');
      expect(readConfig().extractIntervalMinutes).toBe(origInterval);
    });
  });

  // =========================================
  // appendExtractHistory
  // =========================================
  describe('appendExtractHistory', () => {
    it('追加记录后最新条目正确', () => {
      appendExtractHistory(5);
      const history = readConfig().extractHistory;
      const lastEntry = history[history.length - 1];
      expect(lastEntry.count).toBe(5);
    });

    it('追加的记录包含正确的 count 值', () => {
      appendExtractHistory(42);
      const history = readConfig().extractHistory;
      const lastEntry = history[history.length - 1];
      expect(lastEntry.count).toBe(42);
    });

    it('追加的记录包含 ISO 格式时间戳', () => {
      const before = new Date().toISOString();
      appendExtractHistory(7);
      const after = new Date().toISOString();

      const history = readConfig().extractHistory;
      const lastEntry = history[history.length - 1];
      expect(lastEntry.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(lastEntry.time >= before).toBe(true);
      expect(lastEntry.time <= after).toBe(true);
    });

    it('count=0 也能正常记录', () => {
      appendExtractHistory(0);
      const history = readConfig().extractHistory;
      const lastEntry = history[history.length - 1];
      expect(lastEntry.count).toBe(0);
    });

    it('上限 50 条截断', () => {
      // 先写一个干净的 config
      const config = readConfig();
      config.extractHistory = [];
      writeConfig(config);

      // 追加 55 条
      for (let i = 0; i < 55; i++) {
        appendExtractHistory(i);
      }

      const history = readConfig().extractHistory;
      expect(history.length).toBe(50);
      expect(history[0].count).toBe(5);
      expect(history[49].count).toBe(54);
    });

    it('连续追加保持顺序', () => {
      const config = readConfig();
      config.extractHistory = [];
      writeConfig(config);

      appendExtractHistory(10);
      appendExtractHistory(20);
      appendExtractHistory(30);

      const history = readConfig().extractHistory;
      expect(history.length).toBe(3);
      expect(history[0].count).toBe(10);
      expect(history[1].count).toBe(20);
      expect(history[2].count).toBe(30);

      // 时间递增
      expect(history[0].time <= history[1].time).toBe(true);
      expect(history[1].time <= history[2].time).toBe(true);
    });
  });
});
