import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { chromium, type Browser, type Page } from 'playwright';

const NAV_TIMEOUT_MS = 25_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

type SearchEngine = 'baidu' | 'bing';

/**
 * 共享无头 Chromium：免费联网搜索 / 读页。
 * 国内网络优先百度，失败再试必应；串行执行避免并发抢浏览器。
 */
@Injectable()
export class WebSearchBrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSearchBrowserService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private shuttingDown = false;

  async onModuleInit() {
    try {
      await this.getBrowser();
      this.logger.log('无头 Chromium 已启动（web-search）');
    } catch (error) {
      this.logger.error(
        `无头 Chromium 启动失败，联网搜索将不可用：${String(error)}。请执行 pnpm exec playwright install chromium`,
      );
    }
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    // 等队列里进行中的任务结束，避免热重载时关掉正在 evaluate 的 page
    await this.queue.catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.shuttingDown) {
      throw new Error('服务正在关闭，无法启动无头浏览器');
    }
    if (this.browser?.isConnected()) {
      return this.browser;
    }
    if (this.launching) {
      return this.launching;
    }

    this.launching = chromium
      .launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      })
      .then((browser) => {
        this.browser = browser;
        browser.on('disconnected', () => {
          if (this.browser === browser) {
            this.browser = null;
          }
        });
        return browser;
      })
      .finally(() => {
        this.launching = null;
      });

    return this.launching;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async searchWeb(
    query: string,
    maxResults: number,
  ): Promise<{ engine: SearchEngine; results: SearchResultItem[] }> {
    return this.enqueue(async () => {
      const errors: string[] = [];

      for (const engine of ['baidu', 'bing'] as const) {
        try {
          const results = await this.searchWithEngine(engine, query, maxResults);
          if (results.length > 0) {
            return { engine, results };
          }
          errors.push(`${engine}: 无结果`);
        } catch (error) {
          errors.push(`${engine}: ${String(error)}`);
          this.logger.warn(`搜索引擎 ${engine} 失败: ${String(error)}`);
        }
      }

      throw new Error(
        `联网搜索失败（已尝试百度/必应）：${errors.join('；')}`,
      );
    });
  }

  async fetchPageText(
    targetUrl: string,
    maxChars: number,
  ): Promise<{ url: string; title: string; text: string }> {
    return this.enqueue(async () => {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await new Promise((r) => setTimeout(r, 500));

        const payload = (await page.evaluate(
          ((limit: number) => {
            const doc = (
              globalThis as unknown as {
                document: {
                  title: string;
                  querySelector: (s: string) => { innerText: string } | null;
                  body: { innerText: string };
                };
              }
            ).document;
            const title = (doc.title || '').trim();
            const root =
              doc.querySelector('article') ||
              doc.querySelector('main') ||
              doc.body;
            const text = (root?.innerText || '')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
              .slice(0, limit);
            return { title, text };
          }) as (limit: number) => { title: string; text: string },
          maxChars,
        )) as { title: string; text: string };

        return {
          url: page.url(),
          title: payload.title,
          text: payload.text,
        };
      } finally {
        await context.close().catch(() => undefined);
      }
    });
  }

  private async searchWithEngine(
    engine: SearchEngine,
    query: string,
    maxResults: number,
  ): Promise<SearchResultItem[]> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    try {
      if (engine === 'baidu') {
        await page.goto(
          `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
          { waitUntil: 'domcontentloaded' },
        );
        await new Promise((r) => setTimeout(r, 800));
        // 必须先 await 再 return：否则 finally 关 context 时 evaluate 会变成未捕获 rejection 打崩进程
        return await this.extractBaidu(page, maxResults);
      }

      await page.goto(
        `https://cn.bing.com/search?q=${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded' },
      );
      await new Promise((r) => setTimeout(r, 800));
      return await this.extractBing(page, maxResults);
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  private async extractBaidu(
    page: Page,
    maxResults: number,
  ): Promise<SearchResultItem[]> {
    return page.evaluate(
      ((limit: number) => {
        const doc = (
          globalThis as unknown as {
            document: {
              querySelectorAll: (s: string) => ArrayLike<{
                querySelector: (s: string) => {
                  textContent: string | null;
                  href: string;
                } | null;
              }>;
            };
          }
        ).document;
        const nodes = Array.from(
          doc.querySelectorAll('#content_left .c-container'),
        );
        const out: Array<{ title: string; url: string; snippet: string }> = [];
        for (const node of nodes) {
          if (out.length >= limit) break;
          const a = node.querySelector('h3 a');
          if (!a) continue;
          const title = (a.textContent || '').trim();
          const url = a.href || '';
          if (!title || !url) continue;
          const abs = node.querySelector(
            '.c-abstract, .c-span-last, [class*="content-right"]',
          );
          if (
            url.includes('image.baidu.com') ||
            url.includes('baidu.com/search/index')
          ) {
            continue;
          }
          out.push({
            title,
            url,
            snippet: (abs?.textContent || '').trim().slice(0, 240),
          });
        }
        return out;
      }) as (limit: number) => SearchResultItem[],
      maxResults,
    );
  }

  private async extractBing(
    page: Page,
    maxResults: number,
  ): Promise<SearchResultItem[]> {
    return page.evaluate(
      ((limit: number) => {
        const doc = (
          globalThis as unknown as {
            document: {
              querySelectorAll: (s: string) => ArrayLike<{
                querySelector: (s: string) => {
                  textContent: string | null;
                  href: string;
                } | null;
              }>;
            };
          }
        ).document;
        const nodes = Array.from(doc.querySelectorAll('li.b_algo'));
        const out: Array<{ title: string; url: string; snippet: string }> = [];
        for (const node of nodes) {
          if (out.length >= limit) break;
          const a = node.querySelector('h2 a');
          if (!a) continue;
          const title = (a.textContent || '').trim();
          const url = a.href || '';
          if (!title || !url) continue;
          const abs = node.querySelector(
            '.b_caption p, .b_lineclamp2, .b_algoSlug, p',
          );
          out.push({
            title,
            url,
            snippet: (abs?.textContent || '').trim().slice(0, 240),
          });
        }
        return out;
      }) as (limit: number) => SearchResultItem[],
      maxResults,
    );
  }
}
