import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

@toolkitId('coingecko-toolkit-01')
export class CoinGeckoToolkit extends BaseToolkit {
  name = 'CoinGecko 数字货币';
  description =
    'CoinGecko 数字货币数据工具包，支持查询加密货币价格、市值、市场概览、恐惧贪婪指数等数据';
  settings = { apiKey: '' };
  tools: ToolsType[] = [];

  constructor() {
    super();
  }

  validateSettings(): void {
    // apiKey 可选，免费 tier 无需 key
  }

  private async coingeckoRequest(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<any> {
    const url = new URL(`https://api.coingecko.com/api/v3/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.settings.apiKey) {
      headers['x-cg-demo-api-key'] = this.settings.apiKey as string;
    }
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(`CoinGecko 接口错误: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules =
      await this.llamaindexService.getLlamaindexModules();
    const FunctionTool = llamaindexModules.FunctionTool;
    this.tools = [
      FunctionTool.from(this.getCryptoMarket.bind(this), {
        name: 'getCryptoMarket',
        description:
          '查询加密货币市场数据，包括价格、24h涨跌幅、7d涨跌幅、市值、交易量等。支持BTC、ETH、SOL、BNB、XRP等主流币种。',
        parameters: {
          type: 'object',
          properties: {
            ids: {
              type: 'string',
              description:
                '币种ID列表(逗号分隔)，如 bitcoin,ethereum,solana,binancecoin,ripple',
            },
            vs_currency: {
              type: 'string',
              description: '计价货币，默认 usd',
            },
            per_page: {
              type: 'number',
              description: '每页数量，默认10',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getCryptoGlobal.bind(this), {
        name: 'getCryptoGlobal',
        description:
          '查询加密货币市场全局数据，包括总市值、24h交易量、BTC市值占比、活跃币种数量等。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }),
      FunctionTool.from(this.getCryptoFearGreed.bind(this), {
        name: 'getCryptoFearGreed',
        description:
          '查询加密货币恐惧与贪婪指数(Fear & Greed Index)，范围0-100，0为极度恐惧，100为极度贪婪。',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: '返回条数，默认1(最新)',
            },
          },
          required: [],
        },
      }),
    ];
  }

  async getCryptoMarket(params: {
    ids?: string;
    vs_currency?: string;
    per_page?: number;
  }): Promise<string> {
    try {
      const data = await this.coingeckoRequest('coins/markets', {
        ids: params.ids || 'bitcoin,ethereum,solana,binancecoin,ripple',
        vs_currency: params.vs_currency || 'usd',
        order: 'market_cap_desc',
        per_page: params.per_page || 10,
        sparkline: false,
        price_change_percentage: '24h,7d',
      });
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(
        `[Tool:getCryptoMarket] ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message });
    }
  }

  async getCryptoGlobal(): Promise<string> {
    try {
      const data = await this.coingeckoRequest('global');
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(
        `[Tool:getCryptoGlobal] ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message });
    }
  }

  async getCryptoFearGreed(params: { limit?: number }): Promise<string> {
    try {
      const limit = params.limit || 1;
      const res = await fetch(
        `https://api.alternative.me/fng/?limit=${limit}`,
      );
      if (!res.ok) {
        throw new Error(`Fear & Greed 接口错误: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(
        `[Tool:getCryptoFearGreed] ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message });
    }
  }
}
