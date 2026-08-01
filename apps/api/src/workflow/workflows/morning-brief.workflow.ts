import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { MastraService } from '../../mastra/mastra.service.js';
import { WebSearchBrowserService } from '../../toolkit/web-search/web-search-browser.service.js';
import { shanghaiTodayLabel } from '../workflow-context.js';
import { workflowId } from '../workflow.decorator.js';
import { generateWorkflowText } from '../workflow-llm.js';
import type { WorkflowProvider } from '../workflow.types.js';

const WORKFLOW_ID = 'morning-brief';

const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      '自定义搜索主题；不填则默认「今日国内外要闻 / 科技 / 财经」并带上今天日期',
    ),
  maxSearchResults: z
    .number()
    .int()
    .min(3)
    .max(10)
    .optional()
    .describe('搜索条数，默认 6'),
  fetchCount: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe('再读几篇正文，默认 2；设为 0 则只根据摘要写简报'),
});

const outputSchema = z.object({
  brief: z.string(),
  query: z.string(),
  engine: z.string(),
  sources: z.array(sourceSchema),
});

@workflowId(WORKFLOW_ID)
export class MorningBriefWorkflow implements WorkflowProvider {
  readonly name = '晨间简报';
  readonly description =
    '搜索昨夜/今日要点，可选阅读 1–2 篇正文，压缩成短简报。适合「给我今天早报」、配合定时任务每日推送。';
  readonly inputSchema = inputSchema;
  readonly workflow: Workflow<any, any, any, any, any, any>;

  constructor(
    private readonly browser: WebSearchBrowserService,
    private readonly mastra: MastraService,
  ) {
    const searchStep = createStep({
      id: 'search-headlines',
      description: '搜索今日要点',
      inputSchema,
      outputSchema: z.object({
        query: z.string(),
        engine: z.string(),
        fetchCount: z.number(),
        results: z.array(sourceSchema),
      }),
      execute: async ({ inputData }) => {
        const today = shanghaiTodayLabel();
        const query =
          inputData.query?.trim() ||
          `${today} 国内外要闻 科技 财经 昨夜今晨`;
        const maxSearchResults = inputData.maxSearchResults ?? 6;
        const fetchCount = inputData.fetchCount ?? 2;
        const { engine, results } = await this.browser.searchWeb(
          query,
          maxSearchResults,
        );
        return {
          query,
          engine,
          fetchCount,
          results: results.map((item) => ({
            title: item.title,
            url: item.url,
            snippet: item.snippet,
          })),
        };
      },
    });

    const afterSearchSchema = z.object({
      query: z.string(),
      engine: z.string(),
      fetchCount: z.number(),
      results: z.array(sourceSchema),
    });

    const fetchStep = createStep({
      id: 'fetch-articles',
      description: '阅读前列结果正文',
      inputSchema: afterSearchSchema,
      outputSchema: z.object({
        query: z.string(),
        engine: z.string(),
        results: z.array(sourceSchema),
        articles: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            text: z.string(),
          }),
        ),
      }),
      execute: async ({ inputData }) => {
        const articles: Array<{ title: string; url: string; text: string }> =
          [];
        const limit = inputData.fetchCount;
        for (const item of inputData.results) {
          if (articles.length >= limit) break;
          try {
            const page = await this.browser.fetchPageText(item.url, 4000);
            if (page.text.trim().length < 80) continue;
            articles.push({
              title: page.title || item.title,
              url: page.url,
              text: page.text,
            });
          } catch {
            // 单篇失败跳过
          }
        }
        return {
          query: inputData.query,
          engine: inputData.engine,
          results: inputData.results,
          articles,
        };
      },
    });

    const summarizeStep = createStep({
      id: 'write-brief',
      description: '压缩成晨间短简报',
      inputSchema: z.object({
        query: z.string(),
        engine: z.string(),
        results: z.array(sourceSchema),
        articles: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            text: z.string(),
          }),
        ),
      }),
      outputSchema,
      execute: async ({ inputData }) => {
        const resultBlock = inputData.results
          .map(
            (item, index) =>
              `${index + 1}. ${item.title}\n${item.url}\n${item.snippet}`,
          )
          .join('\n\n');
        const articleBlock =
          inputData.articles.length === 0
            ? '（未成功抓取正文，仅依据搜索摘要）'
            : inputData.articles
                .map(
                  (item, index) =>
                    `### 正文 ${index + 1}: ${item.title}\n${item.url}\n${item.text}`,
                )
                .join('\n\n');

        const brief = await generateWorkflowText(
          this.mastra,
          [
            '你是个人助手的晨间简报编辑。',
            '根据搜索结果与可选正文，写一则中文短简报。',
            '要求：3～6 条要点；每条一行，先结论后半句背景；末尾用「来源」列出 3～5 个标题（不必贴长 URL）。',
            '不要编造搜索结果里没有的事实；语气简洁，适合微信/会话快速阅读。',
          ].join('\n'),
          [
            `搜索词：${inputData.query}`,
            `搜索引擎：${inputData.engine}`,
            '',
            '## 搜索结果',
            resultBlock,
            '',
            '## 正文摘录',
            articleBlock,
          ].join('\n'),
        );

        return {
          brief: brief || '未能生成简报，请稍后重试。',
          query: inputData.query,
          engine: inputData.engine,
          sources: inputData.results,
        };
      },
    });

    this.workflow = createWorkflow({
      id: WORKFLOW_ID,
      description: this.description,
      inputSchema,
      outputSchema,
    })
      .then(searchStep)
      .then(fetchStep)
      .then(summarizeStep)
      .commit();
  }
}
