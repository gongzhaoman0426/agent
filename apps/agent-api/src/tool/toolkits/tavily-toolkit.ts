import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

@toolkitId('tavily-toolkit-01')
export class TavilyToolkit extends BaseToolkit {
  name = 'Tavily 搜索';
  description = 'Tavily AI 搜索工具包，支持网络搜索和网页内容提取，适合获取最新市场新闻和分析';
  settings = { apiKey: '' };
  tools: ToolsType[] = [];

  constructor() {
    super();
  }

  validateSettings(): void {
    if (!this.settings.apiKey) {
      throw new Error('缺少必填配置: apiKey (Tavily API Key)');
    }
  }

  private async tavilyRequest(
    endpoint: string,
    body: Record<string, any>,
  ): Promise<any> {
    const res = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.settings.apiKey, ...body }),
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(`Tavily 接口错误: ${data.error}`);
    }
    return data;
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules =
      await this.llamaindexService.getLlamaindexModules();
    const FunctionTool = llamaindexModules.FunctionTool;
    this.tools = [
      FunctionTool.from(this.searchWeb.bind(this), {
        name: 'searchWeb',
        description:
          '使用 Tavily AI 搜索引擎搜索网络信息，返回结构化的搜索结果和AI摘要。适合搜索最新新闻、市场分析、政策动态等。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，如"今日A股市场行情"、"碳酸锂最新消息"',
            },
            search_depth: {
              type: 'string',
              description: '搜索深度: basic(快速) 或 advanced(深度)，默认 basic',
            },
            max_results: {
              type: 'number',
              description: '最大返回结果数，默认5',
            },
            include_answer: {
              type: 'boolean',
              description: '是否包含AI生成的摘要回答，默认true',
            },
          },
          required: ['query'],
        },
      }),
      FunctionTool.from(this.extractContent.bind(this), {
        name: 'extractContent',
        description:
          '从指定URL提取网页的主要文本内容，适合深入阅读搜索结果中的文章。',
        parameters: {
          type: 'object',
          properties: {
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: '要提取内容的URL列表',
            },
          },
          required: ['urls'],
        },
      }),
    ];
  }

  async searchWeb(params: {
    query: string;
    search_depth?: string;
    max_results?: number;
    include_answer?: boolean;
  }): Promise<string> {
    try {
      const body: Record<string, any> = { query: params.query };
      body.search_depth = params.search_depth || 'basic';
      body.max_results = params.max_results || 5;
      body.include_answer = params.include_answer !== false;
      const data = await this.tavilyRequest('search', body);
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:searchWeb] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async extractContent(params: { urls: string[] }): Promise<string> {
    try {
      const data = await this.tavilyRequest('extract', { urls: params.urls });
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:extractContent] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }
}
