import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const GATEWAY_DEFAULT_PORT = 18789;

interface GatewayConfig {
  token: string;
  port: number;
}

/**
 * 读取 OpenClaw Gateway 配置
 * 参考：openclaw.json 中 gateway.auth.token 和 gateway.port
 */
function readGatewayConfig(): GatewayConfig {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`OpenClaw config not found: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return {
    token: config.gateway?.auth?.token || '',
    port: config.gateway?.port || GATEWAY_DEFAULT_PORT,
  };
}

/**
 * 通过 Gateway WebSocket 触发 Agent run，等待完成。
 * 遵循 Gateway Protocol: https://docs.openclaw.ai/gateway/protocol
 *
 * 握手流程：
 *   1. 服务端发 connect.challenge {nonce, ts}
 *   2. 客户端发 {type:"req", method:"connect", params:{auth:{token}}}
 *   3. 服务端返回 {type:"res", ok:true, payload:{type:"hello-ok"}}
 *   4. 客户端发 {type:"req", method:"agent", params:{message, sessionKey}}
 *   5. 服务端返回 streamed events, then {type:"res", ok:true} for completion
 */
export async function triggerAgentRun(options: {
  sessionKey: string;
  message: string;
  timeoutMs?: number;
}): Promise<string> {
  // Dynamic import of ws — only needed at runtime in Node.js
  const { WebSocket } = await import('ws');

  const { token, port } = readGatewayConfig();
  const timeout = options.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Agent run timed out after ${timeout}ms`));
    }, timeout);

    let connectReqId = '';
    let chatReqId = '';
    let collectedText = '';
    let runId = '';

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // Step 1: 收到 connect.challenge 后发送 connect 请求
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          connectReqId = crypto.randomUUID();
          ws.send(JSON.stringify({
            type: 'req',
            id: connectReqId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'gateway-client', version: '2.0.0', platform: 'node', mode: 'backend' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: ['tool-events'],
              commands: [],
              permissions: {},
              auth: { token },
              userAgent: 'memloom-plugin/2.0.0',
            },
          }));
        }

        // Step 2: 收到 hello-ok 后发送 chat.send
        if (msg.type === 'res' && msg.id === connectReqId && msg.ok) {
          chatReqId = crypto.randomUUID();
          ws.send(JSON.stringify({
            type: 'req',
            id: chatReqId,
            method: 'chat.send',
            params: {
              idempotencyKey: crypto.randomUUID(),
              sessionKey: options.sessionKey,
              message: options.message,
            },
          }));
        }

        // chat.send 确认（status: started）—— 不在此处关闭，继续监听事件流
        if (msg.type === 'res' && msg.id === chatReqId) {
          if (msg.ok) {
            runId = msg.payload?.runId || '';
          } else {
            clearTimeout(timer);
            ws.close();
            const errMsg = typeof msg.error === 'string' ? msg.error : msg.error?.message || 'chat.send failed';
            reject(new Error(errMsg));
          }
        }

        // Step 3: 监听 agent 事件流
        if (msg.type === 'event' && msg.event === 'agent') {
          const payload = msg.payload || {};
          const stream = payload.stream;
          const eventData = payload.data || {};

          console.log(`[Memloom RPC] agent event: stream=${stream} phase=${eventData.phase || ''} delta=${(eventData.delta || '').slice(0,50)}`);

          // 从 assistant stream 收集回复内容
          if (stream === 'assistant') {
            const delta = eventData.delta || eventData.text || eventData.content || '';
            if (delta && typeof delta === 'string') {
              collectedText += delta;
            }
          }

          // lifecycle 事件：检测完成
          if (stream === 'lifecycle') {
            if (eventData.phase === 'complete' || eventData.phase === 'end') {
              clearTimeout(timer);
              console.log(`[Memloom RPC] complete! collected=${collectedText.length} chars`);
              ws.close();
              // 尝试从完成事件提取最终文本
              const finalText = eventData.text || eventData.response || eventData.result || '';
              if (finalText && typeof finalText === 'string') {
                collectedText += finalText;
              }
              resolve(collectedText.trim());
            }
            if (eventData.phase === 'error') {
              clearTimeout(timer);
              ws.close();
              reject(new Error(eventData.error || 'Agent run error'));
            }
          }
        }

        // 处理连接错误
        if (msg.type === 'res' && msg.id === connectReqId && !msg.ok) {
          clearTimeout(timer);
          ws.close();
          const errMsg = typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error);
          reject(new Error(`Gateway connect failed: ${errMsg}`));
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timer);
    });
  });
}
