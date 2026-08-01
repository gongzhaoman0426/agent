import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { MastraService } from '../../mastra/mastra.service.js';
import { WebSearchBrowserService } from '../../toolkit/web-search/web-search-browser.service.js';
import { workflowId } from '../workflow.decorator.js';
import { generateWorkflowText } from '../workflow-llm.js';
import type { WorkflowProvider } from '../workflow.types.js';

const WORKFLOW_ID = 'research-summary';

const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

const inputSchema = z.object({
  topic: z.string().min(1).max(300).describe('调研主题或问题'),
  maxSearchResults: z
    .number()
    .int()
    .min(3)
    .max(12)
    .optional()
    .describe('搜索条数，默认 8'),
  fetchCount: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('深入阅读篇数，默认 3'),
});

const outputSchema = z.object({
  report: z.string(),
  topic: z.string(),
  engine: z.string(),
  sources: z.array(sourceSchema),
});

@workflowId(WORKFLOW_ID)
export class ResearchSummaryWorkflow implements WorkflowProvider {
  readonly name = '调研摘要';
  readonly description =
    '给定主题：搜索多条结果 → 阅读 Top K 正文 → 输出结论、争议点与来源链接。适合「帮我调研某某」「对比一下某某」。';
  readonly inputSchema = inputSchema;
  readonly workflow: Workflow<any, any, any, any, any, any>;

  constructor(
    private readonly browser: WebSearchBrowserService,
    private readonly mastra: MastraService,
  ) {
    const searchStep = createStep({
      id: 'search-topic',
      description: '按主题搜索',
      inputSchema,
      outputSchema: z.object({
        topic: z.string(),
        engine: z.string(),
        fetchCount: z.number(),
        results: z.array(sourceSchema),
      }),
      execute: async ({ inputData }) => {
        const topic = inputData.topic.trim();
        const maxSearchResults = inputData.maxSearchResults ?? 8;
        const fetchCount = inputData.fetchCount ?? 3;
        const { engine, results } = await this.browser.searchWeb(
          topic,
          maxSearchResults,
        );
        return {
          topic,
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

    const fetchStep = createStep({
      id: 'read-top-pages',
      description: '阅读前列来源正文',
      inputSchema: z.object({
        topic: z.string(),
        engine: z.string(),
        fetchCount: z.number(),
        results: z.array(sourceSchema),
      }),
      outputSchema: z.object({
        topic: z.string(),
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
        for (const item of inputData.results) {
          if (articles.length >= inputData.fetchCount) break;
          try {
            const page = await this.browser.fetchPageText(item.url, 5000);
            if (page.text.trim().length < 80) continue;
            articles.push({
              title: page.title || item.title,
              url: page.url,
              text: page.text,
            });
          } catch {
            // skip
          }
        }
        if (articles.length === 0) {
          throw new Error(
            '未能抓取到可用正文，请换个主题关键词或稍后重试',
          );
        }
        return {
          topic: inputData.topic,
          engine: inputData.engine,
          results: inputData.results,
          articles,
        };
      },
    });

    const synthesizeStep = createStep({
      id: 'synthesize-report',
      description: '输出结论 / 争议点 / 来源',
      inputSchema: z.object({
        topic: z.string(),
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
        const articleBlock = inputData.articles
          .map(
            (item, index) =>
              `### 来源正文 ${index + 1}: ${item.title}\n${item.url}\n${item.text}`,
          )
          .join('\n\n');

        const report = await generateWorkflowText(
          this.mastra,
          [
            '你是严谨的调研助理。只依据给定材料作答，禁止编造未出现的事实与数据。',
            '请用中文输出，结构必须包含以下三级标题：',
            '## 结论',
            '## 争议点 / 不确定处',
            '## 来源',
            '「来源」下列出标题 + URL（优先用已读正文的链接）。语气克制、条目化。',
          ].join('\n'),
          [
            `调研主题：${inputData.topic}`,
            `搜索引擎：${inputData.engine}`,
            '',
            '## 搜索结果列表',
            resultBlock,
            '',
            '## 已读正文',
            articleBlock,
          ].join('\n'),
        );

        return {
          report: report || '未能生成调研摘要，请稍后重试。',
          topic: inputData.topic,
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
      .then(synthesizeStep)
      .commit();
  }
}
