import type { Anthropic } from '@llamaindex/anthropic';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';

import { ToolsType } from '../tool/interface/toolkit';
import { LlamaindexObserverService } from './llamaindex-observer.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaindexModules: any = null;

@Injectable()
export class LlamaindexService implements OnModuleInit {
  private readonly logger = new Logger(LlamaindexService.name);
  private defaultLlm: Anthropic | null = null;

  constructor(@Optional() private readonly observer?: LlamaindexObserverService) {}

  async getLlamaindexModules() {
    if (!llamaindexModules) {
      const [anthropicModule, openaiModule, llamaindexCore, workflowModule] = await Promise.all([
        import('@llamaindex/anthropic'),
        import('@llamaindex/openai'),
        import('llamaindex'),
        import('@llamaindex/workflow')
      ]);

      llamaindexModules = {
        anthropic: anthropicModule.anthropic,
        OpenAIEmbedding: openaiModule.OpenAIEmbedding,
        Settings: llamaindexCore.Settings,
        FunctionTool: llamaindexCore.FunctionTool,
        agent: workflowModule.agent
      };
    }
    return llamaindexModules;
  }

  async onModuleInit() {
    const { anthropic, OpenAIEmbedding, Settings } = await this.getLlamaindexModules();
    try {
      const { AnthropicSession } = await import('@llamaindex/anthropic');
      const session = new AnthropicSession({
        apiKey: process.env.ANTHROPIC_API_KEY,
        ...(process.env.ANTHROPIC_BASE_URL && { baseURL: process.env.ANTHROPIC_BASE_URL }),
      });
      this.defaultLlm = anthropic({
        model: 'claude-sonnet-4.5',
        temperature: 0.7,
        apiKey: process.env.ANTHROPIC_API_KEY,
        session,
      });
      Settings.llm = this.defaultLlm;
      Settings.embedModel = new OpenAIEmbedding({
        model: 'text-embedding-3-small',
        dimensions: 1536,
      });

      await this.observer?.setupCallbackManager();
      this.logger.log('Default LLM (Anthropic) initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize default LLM', error);
    }
  }

  async createAgent(tools: ToolsType[], prompt?: string, llm?: Anthropic) {
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
   * 将非结构化文本提取为符合 schema 的 JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async structuredExtract(text: string, outputSchema: Record<string, any>): Promise<any> {
    const llm = this.defaultLlm;
    if (!llm) throw new Error('LLM not initialized');

    const schemaStr = JSON.stringify(outputSchema, null, 2);

    const response = await llm.chat({
      messages: [
        {
          role: 'system' as const,
          content: `你是一个 JSON 提取器。从用户提供的文本中提取信息，输出一个合法的 JSON 对象。
要求：
1. 严格遵循以下结构：${schemaStr}
2. 只输出 JSON，不要输出任何其他文字、解释或 markdown 标记
3. 如果某个字段在文本中找不到对应内容，用合理的默认值填充`,
        },
        { role: 'user' as const, content: text },
      ],
    });

    const content = response.message.content;
    let resultText = typeof content === 'string'
      ? content
      : Array.isArray(content)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        : String(content);

    // 清理可能的 markdown 代码块包裹
    resultText = resultText.trim();
    const fenceMatch = resultText.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      resultText = fenceMatch[1].trim();
    }

    return JSON.parse(resultText);
  }
}