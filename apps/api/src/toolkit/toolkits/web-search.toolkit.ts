import { createTool } from '@mastra/core/tools';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { toolkitId } from '../toolkit.decorator.js';
import type { ToolkitDefinition } from '../toolkit.types.js';
import { WebSearchBrowserService } from '../web-search/web-search-browser.service.js';

const TOOLKIT_ID = 'web-search-toolkit';

/**
 * 免费联网搜索工具包：无头 Chromium 访问 DuckDuckGo HTML 版拿结果，
 * 并可打开指定 URL 抽取正文。无需 API Key。
 */
@toolkitId(TOOLKIT_ID)
export class WebSearchToolkit implements ToolkitDefinition {
  readonly name = '联网搜索';
  readonly description =
    '免费联网搜索与网页正文抽取（无头浏览器，优先百度、失败兜底必应）。用于查最新信息、核对事实；搜到链接后可用 fetch_page 读正文。无需 API Key。';
  readonly tools: ToolsInput;

  constructor(private readonly browser: WebSearchBrowserService) {
    this.tools = {
      search_web: createTool({
        id: 'search-web',
        description:
          '用无头浏览器搜索公开网页（优先百度，失败再试必应），返回标题、链接与摘要。适合查新闻、文档、事实；不要用它访问需要登录的页面。',
        inputSchema: z.object({
          query: z.string().min(1).max(300).describe('搜索关键词或问题'),
          maxResults: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe('最多返回几条结果，默认 5，上限 10'),
        }),
        outputSchema: z.object({
          query: z.string(),
          engine: z.string(),
          results: z.array(
            z.object({
              title: z.string(),
              url: z.string(),
              snippet: z.string(),
            }),
          ),
        }),
        execute: async ({ query, maxResults }) => {
          const limit = maxResults ?? 5;
          const { engine, results } = await this.browser.searchWeb(query, limit);
          return { query, engine, results };
        },
      }),

      fetch_page: createTool({
        id: 'fetch-page',
        description:
          '用无头浏览器打开指定 URL，抽取可见正文（优先 article/main）。用于阅读 search_web 返回的链接；勿用于登录页或需交互的站点。',
        inputSchema: z.object({
          url: z.string().url().describe('要打开的完整 http(s) URL'),
          maxChars: z
            .number()
            .int()
            .min(500)
            .max(20_000)
            .optional()
            .describe('正文最大字符数，默认 6000，上限 20000'),
        }),
        outputSchema: z.object({
          url: z.string(),
          title: z.string(),
          text: z.string(),
        }),
        execute: async ({ url, maxChars }) => {
          if (!/^https?:\/\//i.test(url)) {
            throw new Error('仅支持 http/https 链接');
          }
          return this.browser.fetchPageText(url, maxChars ?? 6000);
        },
      }),
    };
  }
}
