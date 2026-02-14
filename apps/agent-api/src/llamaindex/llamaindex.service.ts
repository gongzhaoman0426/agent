import type { Anthropic } from '@llamaindex/anthropic';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ToolsType } from '../tool/interface/toolkit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaindexModules: any = null;

@Injectable()
export class LlamaindexService implements OnModuleInit {
  private readonly logger = new Logger(LlamaindexService.name);
  private defaultLlm: Anthropic | null = null;

  constructor() {}

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
        model: 'claude-sonnet-4.6',
        temperature: 0.7,
        apiKey: process.env.ANTHROPIC_API_KEY,
        session,
      });
      Settings.llm = this.defaultLlm;
      Settings.embedModel = new OpenAIEmbedding({
        model: 'text-embedding-3-small',
        dimensions: 1536,
      });

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
    return response.message.content as string;
  }
}