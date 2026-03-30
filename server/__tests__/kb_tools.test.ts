import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../../db/schema';
import { insertCard, searchCardsByTitle } from '../../db/queries';
import { CardInput } from '../../db/types';

// Mock extractor and gatewayClient 
vi.mock('../../services/extractor', () => ({
  startExtractTimer: vi.fn(),
  stopExtractTimer: vi.fn(),
}));
vi.mock('../../services/gatewayClient', () => ({ triggerAgentRun: vi.fn() }));

function makeCard(id: string, overrides?: Partial<CardInput>): CardInput {
  return {
    id, title: 'Test Card', category: 'ai',
    tags: ['test'], brief: '简要描述', detail: '详细内容', feynman_seed: '复习问题',
    ...overrides,
  };
}

describe('kb_save_card 去重逻辑（集成测试）', () => {
  let db: Database;
  let register: any;

  beforeEach(async () => {
    db = initDatabase(':memory:');
    register = (await import('../../index')).default;
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('正常保存卡片', async () => {
    const tools: any[] = [];
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const saveTool = tools.find(t => t.name === 'kb_save_card');
    expect(saveTool).toBeDefined();

    // 使用符合校验规则的数据（title ≤15字, detail 150-300字）
    const uniqueTitle = `测试卡_${Math.random().toString(36).slice(2, 6)}`;
    const detail = '这是一段用于测试的详细内容，包含了足够多的字符以满足最低150字的限制要求。为了确保通过校验，这里需要写更多的内容来填充。知识卡片的详细内容应该包含底层逻辑和原理的解释，让读者能够真正理解这个概念的本质。这段文字的目的是达到150字的最低要求，同时保持内容的连贯性和可读性，这样测试才能准确反映实际使用场景。';
    const result = await saveTool.execute('test-call', {
      title: uniqueTitle,
      category: 'ai',
      brief: '简要描述',
      detail,
      review_question: '复习问题',
    });
    expect(result.content[0].text).toContain('✅');
  });

  it('无效分类拒绝', async () => {
    const tools: any[] = [];
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const saveTool = tools.find(t => t.name === 'kb_save_card');
    const result = await saveTool.execute('test-call', {
      title: '测试',
      category: 'invalid-category',
      brief: '简要',
      detail: '详细',
      review_question: '问题',
    });
    expect(result.content[0].text).toContain('❌');
    expect(result.content[0].text).toContain('category');
  });

  it('标题为空拒绝', async () => {
    const tools: any[] = [];
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const saveTool = tools.find(t => t.name === 'kb_save_card');
    const result = await saveTool.execute('test-call', {
      title: '',
      category: 'ai',
      brief: '简要',
      detail: '详细',
      review_question: '问题',
    });
    expect(result.content[0].text).toContain('❌');
    expect(result.content[0].text).toContain('title');
  });

  it('标题超过 15 字拒绝', async () => {
    const tools: any[] = [];
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const saveTool = tools.find(t => t.name === 'kb_save_card');
    const result = await saveTool.execute('test-call', {
      title: '这是一个非常非常非常非常非常非常非常非常非常长的标题超过三十个字了',
      category: 'ai',
      brief: '简要',
      detail: '详细',
      review_question: '问题',
    });
    expect(result.content[0].text).toContain('❌');
    expect(result.content[0].text).toContain('title');
  });

  it('tags 为空时默认使用 []', async () => {
    const tools: any[] = [];
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const saveTool = tools.find(t => t.name === 'kb_save_card');
    const uniqueTitle = `无标签_${Math.random().toString(36).slice(2, 6)}`;
    const detail = '这是一段用于测试的详细内容，包含了足够多的字符以满足最低150字的限制要求。为了确保通过校验，这里需要写更多的内容来填充。知识卡片的详细内容应该包含底层逻辑和原理的解释，让读者能够真正理解这个概念的本质。这段文字的目的是达到150字的最低要求，同时保持内容的连贯性和可读性，这样测试才能准确反映实际使用场景。';
    const result = await saveTool.execute('test-call', {
      title: uniqueTitle,
      category: 'ai',
      brief: '简要',
      detail,
      review_question: '问题',
    });
    expect(result.content[0].text).toContain('✅');
  });
});

describe('kb_check_duplicate 工具', () => {
  it('无匹配 → 返回安全信息', async () => {
    const tools: any[] = [];
    const register = (await import('../../index')).default;
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    const checkTool = tools.find(t => t.name === 'kb_check_duplicate');
    expect(checkTool).toBeDefined();

    const result = await checkTool.execute('test-call', {
      title: '完全不存在的标题',
    });
    expect(result.content[0].text).toContain('✅');
    expect(result.content[0].text).toContain('安全');
  });

  it('注册了 kb_check_duplicate 和 kb_save_card 两个工具', async () => {
    const tools: any[] = [];
    const register = (await import('../../index')).default;
    const mockApi = {
      config: {},
      registerHttpRoute: vi.fn(),
      registerTool: (tool: any) => { tools.push(tool); },
      on: vi.fn(),
      registerService: vi.fn(),
    };
    register(mockApi);

    expect(tools.some(t => t.name === 'kb_save_card')).toBe(true);
    expect(tools.some(t => t.name === 'kb_check_duplicate')).toBe(true);
  });
});
