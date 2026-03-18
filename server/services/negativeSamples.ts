import fs from 'fs';
import path from 'path';
import os from 'os';

export interface NegSampleFileEntry {
  card_id: string;
  title: string;
  brief: string;
  deleted_at: string;
}

const JSONL_FILE = path.join(os.homedir(), '.memloom', 'feedback', 'negative_samples.jsonl');
/** Agent 直接可读的 Markdown 文件 */
export const REJECTED_FILE = path.join(os.homedir(), '.memloom', 'feedback', 'rejected.md');

/**
 * 追加一条负样本到 JSONL（原始数据）和 rejected.md（AI 可读）。
 */
export function appendNegativeSample(entry: NegSampleFileEntry, filePath: string = JSONL_FILE): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 1. 追加到 JSONL（原始数据备份）
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');

  // 2. 重建 rejected.md（AI 可直接读取的简明格式）
  rebuildRejectedFile(filePath);
}

/**
 * 读取最近 N 条负样本（最新在前）。
 */
export function readNegativeSamples(count: number, filePath: string = JSONL_FILE): NegSampleFileEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  const entries: NegSampleFileEntry[] = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return entries.slice(-count).reverse();
}

/**
 * 从 JSONL 重建 rejected.md 文件。
 */
function rebuildRejectedFile(jsonlPath: string = JSONL_FILE): void {
  const entries = readNegativeSamples(50, jsonlPath);
  if (entries.length === 0) return;

  const rejectedPath = path.join(path.dirname(jsonlPath), 'rejected.md');
  const lines = [
    '# 忆织复利清单',
    '',
    '> 以下知识曾被用户删除，说明它们不符合提取标准。提取时请避免产生类似内容。',
    '',
  ];
  for (const e of entries) {
    lines.push(`- ❌「${e.title}」— ${e.brief}`);
  }
  lines.push('');

  fs.writeFileSync(rejectedPath, lines.join('\n'), 'utf-8');
}
