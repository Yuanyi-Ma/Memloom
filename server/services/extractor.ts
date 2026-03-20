import fs from 'fs';
import path from 'path';
import os from 'os';
import { readConfig, updateLastExtractTime, appendExtractHistory } from '../utils/config.js';

export interface ConversationChunk {
  sessionId: string;
  content: string;
}

const AGENTS_DIR = path.join(os.homedir(), '.openclaw/agents');
/** 有实际用户对话的 agent，juror/provider 是框架内部角色无需扫描 */
const SCAN_AGENTS = ['main', 'client'];

let timer: ReturnType<typeof setInterval> | null = null;
let delayTimer: ReturnType<typeof setTimeout> | null = null;
let storedOnExtract: ((chunks: ConversationChunk[]) => Promise<void>) | null = null;
let storedSessionsDir: string | undefined;

/**
 * 扫描多个 agent 的 session JSONL 文件，提取指定时间后的对话消息。
 */
export function scanNewSessionMessages(
  since: string,
  agentsDir: string = AGENTS_DIR
): ConversationChunk[] {
  const sinceTime = new Date(since).getTime();
  const results: ConversationChunk[] = [];

  for (const agent of SCAN_AGENTS) {
    const sessionsDir = path.join(agentsDir, agent, 'sessions');
    if (!fs.existsSync(sessionsDir)) continue;

    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      const newMessages: string[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'message') continue;
          if (new Date(entry.timestamp).getTime() <= sinceTime) continue;

          const role = entry.message?.role;
          const text = entry.message?.content
            ?.filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          if (text) newMessages.push(`[${role}]: ${text}`);
        } catch { /* skip malformed lines */ }
      }

      if (newMessages.length > 0) {
        results.push({
          sessionId: `${agent}/${file.replace('.jsonl', '')}`,
          content: newMessages.join('\n\n'),
        });
      }
    }
  }
  return results;
}

/** 执行一次提取周期 */
async function doExtract(): Promise<void> {
  if (!storedOnExtract) return;
  try {
    const cfg = readConfig();
    const chunks = scanNewSessionMessages(cfg.lastExtractTime, storedSessionsDir);
    updateLastExtractTime();
    appendExtractHistory(chunks.length);
    if (chunks.length > 0) {
      await storedOnExtract(chunks);
    }
  } catch (err) {
    console.warn('[KB] Extract timer error:', err);
  }
}

/**
 * 智能调度提取定时器。
 * 根据 lastExtractTime 和当前间隔计算：
 *   - 已超过间隔 → 立即触发一次，然后按间隔循环
 *   - 未超过间隔 → 等待剩余时间后触发，然后按间隔循环
 */
function scheduleExtract(): void {
  stopExtractTimer();
  const config = readConfig();
  if (config.extractIntervalMinutes === 0) return;

  const intervalMs = config.extractIntervalMinutes * 60 * 1000;
  const elapsed = Date.now() - new Date(config.lastExtractTime).getTime();

  if (elapsed >= intervalMs) {
    // 已超过间隔，立即触发一次，然后启动定期循环
    console.log('[KB] Extract overdue, triggering immediately');
    doExtract();
    timer = setInterval(doExtract, intervalMs);
  } else {
    // 未超过间隔，等待剩余时间
    const remaining = intervalMs - elapsed;
    console.log(`[KB] Next extract in ${Math.round(remaining / 1000)}s`);
    delayTimer = setTimeout(() => {
      delayTimer = null;
      doExtract();
      timer = setInterval(doExtract, intervalMs);
    }, remaining);
  }
}

/**
 * 启动定时提取定时器。
 * onExtract 回调由调用方提供，封装 LLM 调用和入库逻辑。
 */
export function startExtractTimer(
  onExtract: (chunks: ConversationChunk[]) => Promise<void>,
  sessionsDir?: string
): void {
  storedOnExtract = onExtract;
  storedSessionsDir = sessionsDir;
  scheduleExtract();
}

/**
 * 重新调度提取定时器（配置更新时调用，无需再传回调）。
 */
export function restartExtractTimer(): void {
  if (!storedOnExtract) return;
  scheduleExtract();
}

export function stopExtractTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (delayTimer) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
}

/**
 * 根据 sessionId 全量读取单个 session JSONL 文件的所有消息。
 * sessionId 格式支持 "agent/uuid" 或纯 "uuid"（默认 main）。
 * 不过滤时间，返回拼接好的对话文本。
 * 如果文件不存在或无消息则返回 null。
 */
export function readFullSession(
  sessionId: string,
  agentsDir: string = AGENTS_DIR
): string | null {
  let agent = 'main';
  let uuid = sessionId;
  if (sessionId.includes('/')) {
    [agent, uuid] = sessionId.split('/');
  }
  const filePath = path.join(agentsDir, agent, 'sessions', `${uuid}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const messages: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'message') continue;

      const role = entry.message?.role;
      const text = entry.message?.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      if (text) messages.push(`[${role}]: ${text}`);
    } catch { /* skip malformed lines */ }
  }

  return messages.length > 0 ? messages.join('\n\n') : null;
}
