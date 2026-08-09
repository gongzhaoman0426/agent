import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * 全局唯一的 Mastra 基础设施：
 * - Memory：会话历史（lastMessages）；可选 Observational Memory / 语义召回
 * - 存储/向量表由 Mastra 自动建表管理，业务表走 Prisma
 */
type ModelRouterId = `${string}/${string}`;

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

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
      configService.get<string>('MASTRA_DEFAULT_MODEL') || DEFAULT_MODEL;
    this.openaiBaseUrl = configService.get<string>('OPENAI_BASE_URL');
    this.openaiApiKey = configService.get<string>('OPENAI_API_KEY');

    /**
     * 语义召回要为「每次提问」和「每条落库消息」各调一次 embedding 接口。
     * 关闭时不需要 embedder / vector，仅保留 lastMessages 近期上下文。
     */
    const semanticRecall =
      (configService.get<string>('MASTRA_SEMANTIC_RECALL') ?? 'false') ===
      'true';

    /**
     * Observational Memory：历史超阈值后由后台 Observer/Reflector 压缩为观察日志。
     * 不能用 observationalMemory: true（默认 Gemini）；显式指定模型。
     */
    const observationalMemory =
      (configService.get<string>('MASTRA_OBSERVATIONAL_MEMORY') ?? 'true') ===
      'true';
    const omModel =
      configService.get<string>('MASTRA_OM_MODEL') || DEFAULT_MODEL;

    // 标题生成在收尾阶段异步进行，不阻塞回复，默认与主模型一致
    const titleModel =
      configService.get<string>('MASTRA_TITLE_MODEL') || DEFAULT_MODEL;

    this.memory = new Memory({
      // Mastra 自建表放独立 schema，避免与 Prisma 管理的 public 互相干扰
      storage: new PostgresStore({
        id: 'agent-next-storage',
        connectionString,
        schemaName: 'mastra',
      }),
      ...(semanticRecall
        ? {
            vector: new PgVector({
              id: 'agent-next-vector',
              connectionString,
              schemaName: 'mastra',
            }),
            embedder: new ModelRouterEmbeddingModel(
              configService.get<string>('MASTRA_EMBEDDING_MODEL') ||
                'openai/text-embedding-3-small',
            ),
          }
        : {}),
      options: {
        lastMessages: 20,
        // resource = `${userId}:${agentId}`，跨会话召回但不跨 Agent
        semanticRecall: semanticRecall
          ? { topK: 4, messageRange: 2, scope: 'resource' }
          : false,
        ...(observationalMemory
          ? {
              observationalMemory: {
                model: this.resolveModel(omModel),
                // DeepSeek 等文本模型不吃附件，避免 Observer 因多模态输入失败
                observation: { observeAttachments: false },
              },
            }
          : {}),
        generateTitle: {
          model: this.resolveModel(titleModel),
          instructions:
            '用不超过 12 个字概括这轮对话的主题作为标题，与用户提问同语种，只输出标题本身，不要引号和标点。',
        },
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
