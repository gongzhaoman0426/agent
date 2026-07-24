import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * 全局唯一的 Mastra 基础设施：
 * - Memory：会话历史（lastMessages）+ 跨会话语义召回（semanticRecall, pgvector）
 * - 存储/向量表由 Mastra 自动建表管理，业务表走 Prisma
 */
type ModelRouterId = `${string}/${string}`;

/**
 * 部分 OpenAI 兼容代理（如 yunwu.ai）的流式响应不发送 finish_reason 就直接
 * [DONE]，AI SDK 会把 finishReason 判为 unknown，Mastra 视为失败并重试整轮
 * LLM 调用，导致回复文本重复输出。此 fetch 包装器在 [DONE] 前注入缺失的
 * finish_reason 块。
 */
const patchedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let sawFinishReason = false;
  let sawToolCalls = false;

  const processLine = (line: string): string => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return line;
    }
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      if (!sawFinishReason) {
        const synthetic = JSON.stringify({
          id: 'synthetic-finish',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'unknown',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: sawToolCalls ? 'tool_calls' : 'stop',
            },
          ],
        });
        return `data: ${synthetic}\n\n${line}`;
      }
      return line;
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          finish_reason?: string | null;
          delta?: { tool_calls?: unknown };
        }>;
      };
      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) {
        sawFinishReason = true;
      }
      if (choice?.delta?.tool_calls) {
        sawToolCalls = true;
      }
    } catch {
      // 非 JSON 数据行原样透传
    }
    return line;
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${processLine(line)}\n`));
      }
    },
    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(processLine(buffer)));
      }
    },
  });

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

@Injectable()
export class MastraService {
  readonly memory: Memory;
  readonly defaultModel: string;
  private readonly openaiBaseUrl?: string;
  private readonly openaiApiKey?: string;
  private readonly modelCache = new Map<string, MastraModelConfig>();

  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('缺少 DATABASE_URL 环境变量');
    }

    this.defaultModel =
      configService.get<string>('MASTRA_DEFAULT_MODEL') || 'openai/gpt-5.5';
    this.openaiBaseUrl = configService.get<string>('OPENAI_BASE_URL');
    this.openaiApiKey = configService.get<string>('OPENAI_API_KEY');

    const embeddingModel =
      configService.get<string>('MASTRA_EMBEDDING_MODEL') ||
      'openai/text-embedding-3-small';

    this.memory = new Memory({
      storage: new PostgresStore({
        id: 'agent-next-storage',
        connectionString,
      }),
      vector: new PgVector({
        id: 'agent-next-vector',
        connectionString,
      }),
      embedder: new ModelRouterEmbeddingModel(embeddingModel),
      options: {
        lastMessages: 10,
        // resource = `${userId}:${agentId}`，跨会话召回但不跨 Agent
        semanticRecall: {
          topK: 4,
          messageRange: 2,
          scope: 'resource',
        },
        generateTitle: true,
      },
    });
  }

  /**
   * 配置了 OPENAI_BASE_URL（OpenAI 兼容代理）时，返回带 finish_reason 修补
   * fetch 的 openai-compatible 模型实例（走 /chat/completions，绕开代理对
   * Responses API 工具续轮的兼容问题）；否则返回模型路由字符串交给 Mastra。
   */
  resolveModel(model?: string | null): MastraModelConfig {
    const id = (model || this.defaultModel) as ModelRouterId;
    if (id.startsWith('openai/') && this.openaiBaseUrl && this.openaiApiKey) {
      const cached = this.modelCache.get(id);
      if (cached) {
        return cached;
      }
      const provider = createOpenAICompatible({
        name: 'openai',
        baseURL: this.openaiBaseUrl,
        apiKey: this.openaiApiKey,
        supportsStructuredOutputs: true,
        fetch: patchedFetch,
      });
      const instance = provider.chatModel(id.slice('openai/'.length));
      this.modelCache.set(id, instance);
      return instance;
    }
    return id;
  }
}
