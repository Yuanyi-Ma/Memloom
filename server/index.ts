import { OpenClawPluginApi, HttpHandler } from './types/plugin.js';
import { initDatabase } from './db/schema.js';
import { createCardsHandler } from './routes/cards.js';
import { createReviewHandler } from './routes/review.js';
import { createImportHandler } from './routes/import.js';
import { createConfigHandler } from './routes/config.js';
import { createSkillsHandler } from './routes/skills.js';
import { readConfig, getCategories } from './utils/config.js';
import { REJECTED_FILE } from './services/negativeSamples.js';
import { createStatsHandler } from './routes/stats.js';
import { startExtractTimer } from './services/extractor.js';
import { insertCard, searchCardsByTitle } from './db/queries.js';
import { generateCardId } from './utils/id.js';
import { CardInput } from './db/types.js';
import { ConversationChunk } from './services/extractor.js';
import { triggerAgentRun } from './services/gatewayClient.js';
import { normalizedSimilarity } from './utils/similarity.js';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { URL } from 'url';

const DB_PATH = path.join(os.homedir(), '.memloom', 'db', 'memloom.sqlite');

// 前端静态文件目录：server/ 同级的 web/dist/
const WEB_DIST_DIR = path.join(__dirname, '..', '..', 'web', 'dist');
const WEB_PORT = 3000;
const GATEWAY_PORT = 18789;

/**
 * Adapter: wraps a raw Node.js (req, res) into our Express-like HttpRequest/HttpResponse
 * so that the route handlers can use res.status(200).json(data) API.
 */
function adaptHandler(handler: HttpHandler): (rawReq: any, rawRes: any) => Promise<boolean> | boolean {
  return async (rawReq: any, rawRes: any) => {
    // Parse URL for query and path params
    const url = new URL(rawReq.url ?? '/', `http://${rawReq.headers?.host ?? 'localhost'}`);
    const query: Record<string, string | undefined> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });

    // Extract path params (e.g. :id from /api/cards/:id or /api/cards/:id/schedule)
    const pathParts = url.pathname.split('/').filter(Boolean);
    const params: Record<string, string> = {};
    const reserved = ['cards', 'review', 'import', 'stats', 'ingest', 'capture', 'start', 'chat', 'schedule', 'summary', 'markdown', 'config', 'categories', 'status', 'history', 'category', 'skills', 'gateway-token', 'validate', 'check-duplicate', 'extract-history'];
    // Scan for non-reserved segments after the resource name (index 1 = resource)
    for (let i = 2; i < pathParts.length; i++) {
      if (!reserved.includes(pathParts[i]!)) {
        params.id = pathParts[i]!;
        break;
      }
    }

    // Parse body for POST/PATCH/PUT
    let body: unknown = undefined;
    if (['POST', 'PATCH', 'PUT'].includes(rawReq.method)) {
      body = await new Promise<unknown>((resolve) => {
        const chunks: Buffer[] = [];
        rawReq.on('data', (chunk: Buffer) => chunks.push(chunk));
        rawReq.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try { resolve(JSON.parse(raw)); }
          catch { resolve(raw); }
        });
      });
    }

    const req = {
      method: rawReq.method ?? 'GET',
      url: url.pathname,
      query,
      body,
      params,
    };

    const res = {
      status(code: number) {
        rawRes.statusCode = code;
        return res;
      },
      json(data: unknown) {
        rawRes.setHeader('Content-Type', 'application/json');
        rawRes.setHeader('Access-Control-Allow-Origin', '*');
        rawRes.end(JSON.stringify(data));
      },
      send(data: string) {
        rawRes.end(data);
      },
      setHeader(key: string, value: string) {
        rawRes.setHeader(key, value);
      },
      write(chunk: string) {
        rawRes.write(chunk);
      },
      end() {
        rawRes.end();
      },
    };

    return handler(req, res);
  };
}

export default function register(api: OpenClawPluginApi) {
  const db = initDatabase(DB_PATH);

  console.log('[Memloom] Plugin loaded, DB at', DB_PATH);

  // === HTTP Routes ===
  api.registerHttpRoute({
    path: '/api/cards', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createCardsHandler(db)),
  });
  api.registerHttpRoute({
    path: '/api/review', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createReviewHandler(db)),
  });
  api.registerHttpRoute({
    path: '/api/import', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createImportHandler(db)),
  });
  api.registerHttpRoute({
    path: '/api/stats', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createStatsHandler(db)),
  });
  api.registerHttpRoute({
    path: '/api/config', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createConfigHandler()),
  });
  api.registerHttpRoute({
    path: '/api/skills', auth: 'plugin', match: 'prefix',
    handler: adaptHandler(createSkillsHandler()),
  });

  // === kb_save_card Tool：唯一入库入口，schema 即格式约束 ===
  api.registerTool({
    name: 'kb_save_card',
    description: '将知识保存为忆织卡片。提取知识后调用此工具入库。',
    parameters: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: '15字以内，核心概念' },
        category: { type: 'string', enum: getCategories(),
                    description: '分类枚举' },
        tags:     { type: 'array', items: { type: 'string' } },
        brief:    { type: 'string', description: '50字以内概括' },
        detail:   { type: 'string', description: '150-300字底层逻辑' },
        review_question: { type: 'string',
                    description: '费曼复习问题' },
      },
      required: ['title', 'category', 'brief', 'detail', 'review_question'],
    },
    async execute(_toolCallId, params) {
      const cats = getCategories();
      if (!cats.includes(params.category)) {
        return { content: [{ type: 'text',
          text: `❌ category 必须是 ${cats.join('/')} 之一` }] };
      }
      if (!params.title || params.title.length > 30) {
        return { content: [{ type: 'text',
          text: '❌ title 不能为空且不超过30字' }] };
      }

      // 服务端去重安全网：检查是否已有标题高度相似的卡片
      const existing = searchCardsByTitle(db, params.title);
      const tooSimilar = existing.find(e => {
        const a = e.title.toLowerCase().replace(/[\s\-_、，,]/g, '');
        const b = params.title.toLowerCase().replace(/[\s\-_、，,]/g, '');
        // 简易相似度：一方包含另一方的核心关键词
        return a.includes(b) || b.includes(a) || normalizedSimilarity(a, b) > 0.7;
      });
      if (tooSimilar) {
        return { content: [{ type: 'text',
          text: `⚠️ 已存在高度相似的知识「${tooSimilar.title}」(ID: ${tooSimilar.id})，跳过入库。如确实不同，请修改标题区分后重试。` }] };
      }

      const cardInput: CardInput = {
        id: generateCardId(),
        title: params.title,
        category: params.category,
        tags: params.tags || [],
        brief: params.brief,
        detail: params.detail,
        feynman_seed: params.review_question,
        status: 'pending',
      };
      insertCard(db, cardInput);
      return { content: [{ type: 'text',
        text: `✅ 已保存「${params.title}」` }] };
    },
  });

  // === kb_check_duplicate Tool：知识查重工具 ===
  api.registerTool({
    name: 'kb_check_duplicate',
    description: '检查知识库中是否已有与给定标题相似的条目。当你在知识索引中发现可能重复的知识时，调用此工具获取已有条目的完整内容进行精确比对。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '待查重的知识标题或核心关键词' },
      },
      required: ['title'],
    },
    async execute(_toolCallId, params) {
      const matches = searchCardsByTitle(db, params.title);
      if (matches.length === 0) {
        return { content: [{ type: 'text',
          text: '✅ 未找到相似条目，可安全入库。' }] };
      }
      const lines = matches.map((m, i) =>
        `[${i + 1}] 「${m.title}」\n   摘要: ${m.brief}\n   详情: ${m.detail.slice(0, 200)}...`
      ).join('\n\n');
      return { content: [{ type: 'text',
        text: `⚠️ 发现 ${matches.length} 条可能相似的已有知识：\n\n${lines}\n\n请对比内容，如果核心概念重复则跳过该知识点。` }] };
    },
  });

  // === kb_validate_card Tool：字段合法性校验工具 ===
  api.registerTool({
    name: 'kb_validate_card',
    description: '校验知识卡片的字段合法性。在调用 kb_save_card 入库之前，必须先用此工具校验。',
    parameters: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: '卡片标题' },
        category: { type: 'string', description: '分类' },
        tags:     { type: 'array', items: { type: 'string' }, description: '标签' },
        brief:    { type: 'string', description: '摘要' },
        detail:   { type: 'string', description: '详细内容' },
        review_question: { type: 'string', description: '复习问题' },
      },
      required: ['title', 'category', 'brief', 'detail', 'review_question'],
    },
    async execute(_toolCallId, params) {
      const errors: string[] = [];
      const cats = getCategories();

      // title
      if (!params.title || params.title.trim().length === 0) {
        errors.push('title 不能为空');
      } else if (params.title.length > 15) {
        errors.push(`title 超过 15 字限制（当前 ${params.title.length} 字）`);
      }

      // category
      if (!cats.includes(params.category)) {
        errors.push(`category 必须是 ${cats.join(' / ')} 之一，当前值「${params.category}」不合法`);
      }

      // brief
      if (!params.brief || params.brief.trim().length === 0) {
        errors.push('brief 不能为空');
      } else if (params.brief.length > 100) {
        errors.push(`brief 超过 100 字限制（当前 ${params.brief.length} 字）`);
      }

      // detail
      if (!params.detail || params.detail.trim().length === 0) {
        errors.push('detail 不能为空');
      } else if (params.detail.length < 150) {
        errors.push(`detail 不足 150 字（当前 ${params.detail.length} 字），请补充更多底层逻辑`);
      } else if (params.detail.length > 300) {
        errors.push(`detail 超过 300 字限制（当前 ${params.detail.length} 字），请精简`);
      }

      // review_question
      if (!params.review_question || params.review_question.trim().length === 0) {
        errors.push('review_question 不能为空');
      }

      if (errors.length > 0) {
        return { content: [{ type: 'text',
          text: `❌ 校验未通过（${errors.length} 个问题）：\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}\n\n请修正后重新调用 kb_validate_card。` }] };
      }

      return { content: [{ type: 'text',
        text: '✅ 校验通过，可以调用 kb_save_card 入库。' }] };
    },
  });



  // === 定时提取：通过 Agent RPC 触发知识提取 ===
  startExtractTimer(async (chunks: ConversationChunk[]) => {
    for (const chunk of chunks) {
      try {
        await triggerAgentRun({
          sessionKey: `memloom-extract-${chunk.sessionId}`,
          message: `请回顾以下对话记录并提取知识：\n\n${chunk.content}`,
        });
        console.log(`[Memloom] Agent extraction triggered for session ${chunk.sessionId}`);
      } catch (err) {
        console.warn(`[Memloom] Extract error for session ${chunk.sessionId}:`, err);
      }
    }
  });

  console.log('[Memloom] Extract timer started');

  // === 独立 Web 服务器（端口 3000）：API 代理 + 静态文件 ===
  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };

  const webServer = http.createServer((req, res) => {
    const reqUrl = req.url ?? '/';

    // /api/* 请求代理到 Gateway
    if (reqUrl.startsWith('/api/')) {
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: GATEWAY_PORT,
        path: reqUrl,
        method: req.method,
        headers: req.headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        console.warn('[Memloom Web] API proxy error:', err.message);
        res.writeHead(502);
        res.end('Bad Gateway');
      });
      req.pipe(proxyReq);
      return;
    }

    // 静态文件服务
    const url = new URL(reqUrl, `http://localhost:${WEB_PORT}`);
    let filePath = path.join(WEB_DIST_DIR, url.pathname);

    // SPA fallback：文件不存在时返回 index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(WEB_DIST_DIR, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  api.registerService({
    id: 'memloom-web',
    start: () => {
      webServer.listen(WEB_PORT, () => {
        console.log(`[Memloom] Web UI ready at http://127.0.0.1:${WEB_PORT}`);
      });
    },
    stop: () => {
      webServer.close();
    },
  });
}
