export interface HttpRequest {
  method: string;
  url: string;
  query: Record<string, string | undefined>;
  body: unknown;
  params: Record<string, string>;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: unknown): void;
  send(data: string): void;
  setHeader(key: string, value: string): void;
  write(chunk: string): void;
  end(): void;
}

export type HttpHandler = (req: HttpRequest, res: HttpResponse) => Promise<boolean> | boolean;

export interface HttpRouteConfig {
  path: string;
  auth: 'plugin' | 'none';
  match?: 'prefix' | 'exact';
  handler: HttpHandler;
}

// --- Agent Tool types ---

export interface AgentToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, any>) => Promise<AgentToolResult>;
}

export interface AgentToolResult {
  content: Array<{ type: string; text: string }>;
}

// --- Plugin Hook types ---

export type PluginHookHandler = (event: any, ctx: any) => PluginHookReturn | void;

export interface PluginHookReturn {
  prependContext?: string;
  systemPrompt?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
}

// --- Background Service types ---

export interface BackgroundServiceConfig {
  id: string;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
}

// --- Plugin API ---

export interface OpenClawPluginApi {
  config: {
    models?: {
      providers?: Record<string, { apiKey?: string }>;
    };
  };
  registerHttpRoute(config: HttpRouteConfig): void;
  registerTool(tool: AgentToolConfig, options?: { optional?: boolean }): void;
  on(event: string, handler: PluginHookHandler, options?: { priority?: number }): void;
  registerService(config: BackgroundServiceConfig): void;
}
