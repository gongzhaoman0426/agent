import type { OpenAI } from '@llamaindex/openai';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';

import { ToolsType } from '../tool/interface/toolkit';
import { LlamaindexObserverService } from './llamaindex-observer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaindexModules: any = null;

const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class LlamaindexService implements OnModuleInit {
  private readonly logger = new Logger(LlamaindexService.name);
  private defaultLlm: OpenAI | null = null;

  constructor(@Optional() private readonly observer?: LlamaindexObserverService) {}

  async getLlamaindexModules() {
    if (!llamaindexModules) {
      const [openaiModule, llamaindexCore, workflowModule] = await Promise.all([
        import('@llamaindex/openai'),
        import('llamaindex'),
        import('@llamaindex/workflow')
      ]);

      llamaindexModules = {
        OpenAI: openaiModule.OpenAI,
        OpenAIEmbedding: openaiModule.OpenAIEmbedding,
        Settings: llamaindexCore.Settings,
        FunctionTool: llamaindexCore.FunctionTool,
        agent: workflowModule.agent
      };
    }
    return llamaindexModules;
  }

  async onModuleInit() {
    const { OpenAI, OpenAIEmbedding, Settings } = await this.getLlamaindexModules();
    try {
      this.defaultLlm = new OpenAI({
        model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
        temperature: 0.7,
        apiKey: process.env.OPENAI_API_KEY,
        ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
      });
      Settings.llm = this.defaultLlm;
      Settings.embedModel = new OpenAIEmbedding({
        model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL,
        dimensions: 1536,
        apiKey: process.env.OPENAI_API_KEY,
        ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
      });

      await this.observer?.setupCallbackManager();
      this.logger.log(`Default LLM (OpenAI ${process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL}) initialized successfully`);
    } catch (error) {
      this.logger.error('Failed to initialize default LLM', error);
    }
  }

  async createAgent(tools: ToolsType[], prompt?: string, llm?: OpenAI) {
    const { agent } = await this.getLlamaindexModules();
    return agent({
      tools,
      systemPrompt: prompt,
      llm: llm || this.defaultLlm,
      verbose: false,
    });
  }

  async chat(message: string, systemPrompt?: string): Promise<string> {
    const llm = this.defaultLlm;
    if (!llm) throw new Error('LLM not initialized');
    const response = await llm.chat({
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: message },
      ],
    });
    const content = response.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
    }
    return String(content);
  }

  /**
   * 使用默认 OpenAI 模型将非结构化文本提取为符合 schema 的 JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async structuredExtract(text: string, outputSchema: Record<string, any>): Promise<any> {
    const { OpenAI } = await import('@llamaindex/openai');
    const extractLlm = new OpenAI({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
      additionalChatOptions: { response_format: { type: 'json_object' } },
    });

    const schemaStr = JSON.stringify(outputSchema, null, 2);

    const response = await extractLlm.chat({
      messages: [
        {
          role: 'system' as const,
          content: `你是一个 JSON 提取器。从用户提供的文本中提取信息，输出一个合法的 JSON 对象。严格遵循以下结构：${schemaStr}`,
        },
        { role: 'user' as const, content: text },
      ],
    });

    const content = response.message.content;
    const resultText = typeof content === 'string'
      ? content
      : Array.isArray(content)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        : String(content);

    return JSON.parse(resultText);
  }
}
