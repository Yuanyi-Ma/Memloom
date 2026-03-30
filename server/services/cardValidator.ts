import { Database } from 'better-sqlite3';
import { getCategories } from '../utils/config.js';
import { searchCardsByTitle } from '../db/queries.js';
import { normalizedSimilarity } from '../utils/similarity.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 统一的卡片字段校验逻辑。
 * 所有入口（Tool、HTTP route）共用此函数，确保规则一致。
 */
export function validateCard(card: {
  title?: string;
  category?: string;
  brief?: string;
  detail?: string;
  review_question?: string;
}): ValidationResult {
  const errors: string[] = [];
  const cats = getCategories();

  // title
  if (!card.title || card.title.trim().length === 0) {
    errors.push('title 不能为空');
  } else if (card.title.length > 15) {
    errors.push(`title 超过 15 字限制（当前 ${card.title.length} 字）`);
  }

  // category
  if (!card.category || !cats.includes(card.category)) {
    errors.push(`category 必须是 ${cats.join(' / ')} 之一，当前值「${card.category ?? ''}」不合法`);
  }

  // brief
  if (!card.brief || card.brief.trim().length === 0) {
    errors.push('brief 不能为空');
  } else if (card.brief.length > 100) {
    errors.push(`brief 超过 100 字限制（当前 ${card.brief.length} 字）`);
  }

  // detail
  if (!card.detail || card.detail.trim().length === 0) {
    errors.push('detail 不能为空');
  } else if (card.detail.length < 150) {
    errors.push(`detail 不足 150 字（当前 ${card.detail.length} 字），请补充更多底层逻辑`);
  } else if (card.detail.length > 300) {
    errors.push(`detail 超过 300 字限制（当前 ${card.detail.length} 字），请精简`);
  }

  // review_question
  if (!card.review_question || card.review_question.trim().length === 0) {
    errors.push('review_question 不能为空');
  }

  return { valid: errors.length === 0, errors };
}

export interface DuplicateMatch {
  id: string;
  title: string;
  brief: string;
  detail: string;
}

/**
 * 在数据库中查找与给定标题高度相似的卡片。
 * 返回第一个匹配项，或 null。
 */
export function findDuplicate(db: Database, title: string): DuplicateMatch | null {
  const existing = searchCardsByTitle(db, title);
  return existing.find(e => {
    const a = e.title.toLowerCase().replace(/[\s\-_、，,]/g, '');
    const b = title.toLowerCase().replace(/[\s\-_、，,]/g, '');
    return a.includes(b) || b.includes(a) || normalizedSimilarity(a, b) > 0.7;
  }) ?? null;
}
