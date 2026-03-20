import fs from 'fs';
import path from 'path';
import os from 'os';
import { KBConfig } from '../db/types.js';

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  'ai': 'green',
  'academic': 'blue',
  'general': 'gray',
};

const DEFAULT_CONFIG: KBConfig = {
  extractIntervalMinutes: 30,
  lastExtractTime: new Date(0).toISOString(),
  maxNegativeSamples: 50,
  categories: ['ai', 'academic', 'general'],
  categoryColors: DEFAULT_CATEGORY_COLORS,
  extractHistory: [],
};

function getConfigPath(): string {
  const kbDir = path.join(os.homedir(), '.memloom');
  if (!fs.existsSync(kbDir)) {
    fs.mkdirSync(kbDir, { recursive: true });
  }
  return path.join(kbDir, 'config.json');
}

export function readConfig(): KBConfig {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG, categoryColors: { ...DEFAULT_CATEGORY_COLORS } };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<KBConfig>;
    return {
      ...DEFAULT_CONFIG,
      categoryColors: { ...DEFAULT_CATEGORY_COLORS },
      ...parsed,
    };
  } catch (e) {
    return { ...DEFAULT_CONFIG, categoryColors: { ...DEFAULT_CATEGORY_COLORS } };
  }
}

export function writeConfig(config: KBConfig): void {
  const filePath = getConfigPath();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateLastExtractTime(time?: string): void {
  const currentConfig = readConfig();
  currentConfig.lastExtractTime = time || new Date().toISOString();
  writeConfig(currentConfig);
}

const MAX_EXTRACT_HISTORY = 50;

export function appendExtractHistory(count: number): void {
  const config = readConfig();
  const history = config.extractHistory || [];
  history.push({ time: new Date().toISOString(), count });
  // 保留最近 MAX_EXTRACT_HISTORY 条
  if (history.length > MAX_EXTRACT_HISTORY) {
    history.splice(0, history.length - MAX_EXTRACT_HISTORY);
  }
  config.extractHistory = history;
  writeConfig(config);
}

/** 便捷函数：获取当前配置的分类列表 */
export function getCategories(): string[] {
  return readConfig().categories;
}

/** 获取默认配置（完整副本） */
export function getDefaultConfig(): KBConfig {
  return { ...DEFAULT_CONFIG, categoryColors: { ...DEFAULT_CATEGORY_COLORS } };
}

