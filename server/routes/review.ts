import { Database } from 'better-sqlite3';
import { HttpHandler, HttpRequest, HttpResponse } from '../types/plugin.js';
import { getDueCards, getCardById } from '../db/queries.js';
import { buildReviewQueue } from '../services/aggregator.js';
import { triggerAgentRun } from '../services/gatewayClient.js';

export function createReviewHandler(db: Database): HttpHandler {
  return async (req: HttpRequest, res: HttpResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).json({}); return true; }

    // POST /api/review/start — 保持不变
    if (req.url.includes('/start')) {
      const { count, category } = (req.body || {}) as any;
      const today = new Date().toISOString().slice(0, 10);
      let dueCards = getDueCards(db, today);
      if (category) dueCards = dueCards.filter(c => c.category === category);
      const queue = buildReviewQueue(dueCards, count || 20);
      res.status(200).json({ queue, total: queue.length });
      return true;
    }

    // POST /api/review/chat — 通过 Agent RPC 进行费曼复习对话
    if (req.url.includes('/chat')) {
      const { cardId, action, userMessage } = (req.body || {}) as any;

      // action=start: 初始化复习会话，返回卡片信息
      if (action === 'start') {
        const card = getCardById(db, cardId);
        if (!card) { res.status(404).json({ error: 'Card not found' }); return true; }
        res.status(200).json({
          cardId: card.id, title: card.title,
          feynman_seed: card.feynman_seed, content_md: card.detail,
        });
        return true;
      }

      // action=chat: 转发用户消息到 Agent
      if (!cardId || !userMessage) {
        res.status(400).json({ error: 'Missing cardId or userMessage' });
        return true;
      }

      const card = getCardById(db, cardId);
      if (!card) { res.status(404).json({ error: 'Card not found' }); return true; }

      try {
        // 通过 Agent RPC 发送复习对话，获取 Agent 真实回复
        const agentReply = await triggerAgentRun({
          sessionKey: `memloom-review-${cardId}`,
          message: [
            `[费曼复习] 用户正在复习知识卡片「${card.title}」`,
            `卡片内容: ${card.detail || card.brief}`,
            `复习问题: ${card.feynman_seed}`,
            ``,
            `用户回答: ${userMessage}`,
            ``,
            `请以苏格拉底式提问方式引导用户深入理解，指出回答中的不足，鼓励其用自己的话解释。回复请简短（100字以内）。`,
          ].join('\n'),
          timeoutMs: 60_000,
        });
        console.log(`[Memloom Review] Agent reply (${agentReply.length} chars): ${agentReply.slice(0, 100)}`);
        res.status(200).json({
          reply: agentReply || '我已收到你的回答，正在思考中...',
          agentTriggered: true,
        });
      } catch (err) {
        console.warn(`[Memloom Review] Agent RPC failed:`, err);
        // Agent 不可用时，根据用户回答长度给出不同的引导回复
        const fallback = userMessage.length < 10
          ? `你的回答比较简短。试着用更完整的语言解释一下「${card.title}」的核心原理？`
          : `不错的思考方向！能否进一步解释一下「${card.title}」背后的底层机制和关键取舍？`;
        res.status(200).json({
          reply: fallback,
          agentTriggered: false,
        });
      }
      return true;
    }

    return false;
  };
}
