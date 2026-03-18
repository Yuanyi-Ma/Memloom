import { Database } from 'better-sqlite3';
import { HttpHandler, HttpRequest, HttpResponse } from '../types/plugin.js';
import { triggerAgentRun } from '../services/gatewayClient.js';

/** 按 `---` 或 `## ` 标题拆分文档为合理大小的块 */
export function splitIntoChunks(text: string, maxChars = 1500): string[] {
  // 先按 --- 分割
  const sections = text.split(/\n---\n/).map(s => s.trim()).filter(s => s.length > 0);

  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    if (current.length + section.length + 10 > maxChars && current.length > 0) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? current + '\n\n---\n\n' + section : section;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}

export function createImportHandler(db: Database): HttpHandler {
  return async (req: HttpRequest, res: HttpResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).json({}); return true; }

    const { files } = req.body as { files: { filename: string; content: string }[] };
    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Missing field: files' }); return true;
    }

    const combined = files.map(f => f.content).join('\n\n---\n\n');
    const chunks = splitIntoChunks(combined);
    console.log(`[Memloom Import] Total ${combined.length} chars → ${chunks.length} chunks`);

    let triggered = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        await triggerAgentRun({
          sessionKey: `memloom-import-${Date.now()}-${i}`,
          message: `请从以下文档片段中提取知识并入库：\n\n${chunks[i]}`,
        });
        triggered++;
        console.log(`[Memloom Import] Chunk ${i + 1}/${chunks.length}: Agent triggered`);
      } catch (err) {
        console.error(`[Memloom Import] Chunk ${i + 1}/${chunks.length} failed:`, err);
      }
    }

    // Agent 通过 kb_save_card Tool 直接入库，这里只返回触发结果
    res.status(200).json({ triggered, totalChunks: chunks.length });
    return true;
  };
}
