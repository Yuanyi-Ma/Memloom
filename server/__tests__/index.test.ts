import { describe, it, expect, vi } from 'vitest';
import { OpenClawPluginApi, HttpRouteConfig, AgentToolConfig } from '../types/plugin';

// Mock initDatabase to use in-memory for testing
vi.mock('../db/schema', () => ({
  initDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn() })),
    pragma: vi.fn(),
    exec: vi.fn(),
    transaction: vi.fn(),
  })),
}));

vi.mock('../services/extractor', () => ({
  startExtractTimer: vi.fn(),
  stopExtractTimer: vi.fn(),
}));

// Mock modules used by index.ts (V2.0: no more llmClient/prompts)
vi.mock('../services/negativeSamples', () => ({ readNegativeSamples: vi.fn(() => []), appendNegativeSample: vi.fn() }));
vi.mock('../db/queries', () => ({ insertCard: vi.fn() }));
vi.mock('../utils/id', () => ({ generateCardId: vi.fn(() => 'test-id') }));
vi.mock('../services/gatewayClient', () => ({ triggerAgentRun: vi.fn() }));

describe('Plugin Entry', () => {
  it('exports a register function', async () => {
    const register = (await import('../index')).default;
    expect(typeof register).toBe('function');
  });

  it('register calls registerHttpRoute, registerTool, and on', async () => {
    const register = (await import('../index')).default;
    const routes: HttpRouteConfig[] = [];
    const tools: AgentToolConfig[] = [];
    const hooks: { event: string }[] = [];
    const mockApi: OpenClawPluginApi = {
      config: {},
      registerHttpRoute: (config: HttpRouteConfig) => { routes.push(config); },
      registerTool: (tool: AgentToolConfig) => { tools.push(tool); },
      on: (event: string) => { hooks.push({ event }); },
      registerService: vi.fn(),
    };
    register(mockApi);
    // HTTP routes
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(routes.some(r => r.path.includes('/api/cards'))).toBe(true);
    expect(routes.some(r => r.path.includes('/api/review'))).toBe(true);
    expect(routes.some(r => r.path.includes('/api/import'))).toBe(true);
    expect(routes.some(r => r.path.includes('/api/stats'))).toBe(true);
    // Tool
    expect(tools.some(t => t.name === 'kb_save_card')).toBe(true);
    // Hook
    expect(hooks.some(h => h.event === 'before_prompt_build')).toBe(true);
  });
});
