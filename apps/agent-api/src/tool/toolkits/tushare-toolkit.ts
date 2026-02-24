import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

@toolkitId('tushare-toolkit-01')
export class TushareToolkit extends BaseToolkit {
  name = 'Tushare 金融数据';
  description =
    'Tushare Pro 金融数据工具包，支持查询A股行情、指数、期货、基金、龙虎榜、国际指数、两融、北向资金、板块、债券、外汇等数据';
  settings = { token: '' };
  tools: ToolsType[] = [];

  constructor() {
    super();
  }

  validateSettings(): void {
    if (!this.settings.token) {
      throw new Error('缺少必填配置: token (Tushare Pro API Token)');
    }
  }

  private async tushareRequest(
    apiName: string,
    params: Record<string, any>,
    fields?: string,
  ): Promise<any[]> {
    const res = await fetch('https://api.tushare.pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: apiName,
        token: this.settings.token,
        params,
        fields: fields || '',
      }),
    });
    const data = (await res.json()) as {
      code: number;
      msg: string;
      data: { fields: string[]; items: any[][] };
    };
    if (data.code !== 0) {
      throw new Error(`Tushare 接口错误 (${apiName}): ${data.msg}`);
    }
    const { fields: columns, items } = data.data;
    return items.map((row) =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]])),
    );
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules =
      await this.llamaindexService.getLlamaindexModules();
    const FunctionTool = llamaindexModules.FunctionTool;
    this.tools = [
      FunctionTool.from(this.getStockDaily.bind(this), {
        name: 'getStockDaily',
        description:
          '查询A股日线行情数据，包括开盘价、收盘价、最高价、最低价、成交量、涨跌幅等。可按股票代码或交易日期查询。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description: '股票代码，如 000001.SZ（平安银行）、600519.SH（贵州茅台）',
            },
            trade_date: {
              type: 'string',
              description: '交易日期，格式 YYYYMMDD，如 20250224',
            },
            start_date: {
              type: 'string',
              description: '开始日期，格式 YYYYMMDD',
            },
            end_date: {
              type: 'string',
              description: '结束日期，格式 YYYYMMDD',
            },
            limit: {
              type: 'number',
              description: '返回条数限制，默认20',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getIndexDaily.bind(this), {
        name: 'getIndexDaily',
        description:
          '查询指数日线行情，如上证指数(000001.SH)、深证成指(399001.SZ)、创业板指(399006.SZ)、中证1000(000852.SH)等。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description:
                '指数代码，如 000001.SH(上证指数)、399001.SZ(深证成指)、399006.SZ(创业板指)、000852.SH(中证1000)',
            },
            trade_date: {
              type: 'string',
              description: '交易日期，格式 YYYYMMDD',
            },
            start_date: {
              type: 'string',
              description: '开始日期，格式 YYYYMMDD',
            },
            end_date: {
              type: 'string',
              description: '结束日期，格式 YYYYMMDD',
            },
            limit: {
              type: 'number',
              description: '返回条数限制，默认20',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getFuturesDaily.bind(this), {
        name: 'getFuturesDaily',
        description:
          '查询期货日线行情（需要较高Tushare积分）。支持查询贵金属、有色、能源、农产品等期货品种。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description: '期货合约代码，如 AU2406.SHF(黄金)、CU2406.SHF(铜)',
            },
            trade_date: {
              type: 'string',
              description: '交易日期，格式 YYYYMMDD',
            },
            start_date: {
              type: 'string',
              description: '开始日期，格式 YYYYMMDD',
            },
            end_date: {
              type: 'string',
              description: '结束日期，格式 YYYYMMDD',
            },
            limit: {
              type: 'number',
              description: '返回条数限制，默认20',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getMarketOverview.bind(this), {
        name: 'getMarketOverview',
        description:
          '获取A股市场每日整体概况，包括成交额、成交量、涨停家数、跌停家数等统计数据。',
        parameters: {
          type: 'object',
          properties: {
            trade_date: {
              type: 'string',
              description: '交易日期，格式 YYYYMMDD',
            },
            exchange: {
              type: 'string',
              description: '交易所代码: SSE(上交所)、SZSE(深交所)，不填则返回全部',
            },
          },
          required: ['trade_date'],
        },
      }),
      FunctionTool.from(this.getTopList.bind(this), {
        name: 'getTopList',
        description:
          '获取龙虎榜数据，包括上榜个股、买入卖出金额、上榜原因等。',
        parameters: {
          type: 'object',
          properties: {
            trade_date: {
              type: 'string',
              description: '交易日期，格式 YYYYMMDD',
            },
          },
          required: ['trade_date'],
        },
      }),
      FunctionTool.from(this.getFundNav.bind(this), {
        name: 'getFundNav',
        description:
          '查询基金净值数据，包括单位净值、累计净值、日增长率等。可查询ETF、LOF、开放式基金等。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description: '基金代码，如 510300.SH(沪深300ETF)、159915.SZ(创业板ETF)',
            },
            end_date: {
              type: 'string',
              description: '截止日期，格式 YYYYMMDD',
            },
            market: {
              type: 'string',
              description: '市场类型: E(场内)、O(场外)',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getGlobalIndex.bind(this), {
        name: 'getGlobalIndex',
        description:
          '查询国际主要指数日线行情，包括美股(道琼斯DJI、标普500 XIN9、纳斯达克IXIC)、欧洲(富时100 FTSE、德国DAX GDAXI、法国CAC40 FCHI)、VIX恐慌指数(CBOE_VIX)等。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description: '指数代码，如 DJI(道琼斯)、XIN9(标普500)、IXIC(纳斯达克)、CBOE_VIX(VIX)、FTSE(富时100)、GDAXI(DAX)、FCHI(CAC40)',
            },
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getMarginData.bind(this), {
        name: 'getMarginData',
        description:
          '查询融资融券交易汇总数据，包括融资余额(rzye)、融资买入额(rzmre)、融券余额(rqye)等。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            exchange_id: { type: 'string', description: '交易所代码: SSE(上交所)、SZSE(深交所)' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getNorthboundFlow.bind(this), {
        name: 'getNorthboundFlow',
        description:
          '查询沪深港通资金流向数据，包括沪股通(hgt)、深股通(sgt)、北向资金净流入(north_money)、南向资金净流入(south_money)等。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getSectorDaily.bind(this), {
        name: 'getSectorDaily',
        description:
          '查询同花顺板块行情数据，包括行业板块和概念板块的涨跌幅、成交量、换手率等。适合分析热点板块轮动。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: { type: 'string', description: '板块代码，如 885600.TI' },
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认30' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getLimitList.bind(this), {
        name: 'getLimitList',
        description:
          '查询每日涨跌停统计数据，包括涨停/跌停个股列表、封板金额、首次封板时间、开板次数等。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            limit_type: { type: 'string', description: '涨跌停类型: U(涨停)、D(跌停)' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: ['trade_date'],
        },
      }),
      FunctionTool.from(this.getTreasuryYield.bind(this), {
        name: 'getTreasuryYield',
        description:
          '查询国债收益率曲线数据，包括不同期限(1Y/2Y/5Y/10Y/30Y)的到期收益率。适合分析利率走势和期限利差。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: { type: 'string', description: '收益率曲线编码，如 1001.CB(中债国债)' },
            curve_type: { type: 'string', description: '曲线类型，如 0(到期收益率)' },
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getShibor.bind(this), {
        name: 'getShibor',
        description:
          '查询上海银行间同业拆放利率(SHIBOR)数据，包括隔夜(on)、1周(1w)、1月(1m)、3月(3m)等各期限利率。',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: '日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.getForexDaily.bind(this), {
        name: 'getForexDaily',
        description:
          '查询外汇日线行情数据，包括美元/人民币(USDCNY.FXCM)、欧元/美元(EURUSD.FXCM)、美元/日元(USDJPY.FXCM)、英镑/美元(GBPUSD.FXCM)等。需要较高Tushare积分。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: { type: 'string', description: '外汇代码，如 USDCNY.FXCM、EURUSD.FXCM、USDJPY.FXCM、GBPUSD.FXCM' },
            trade_date: { type: 'string', description: '交易日期，格式 YYYYMMDD' },
            start_date: { type: 'string', description: '开始日期，格式 YYYYMMDD' },
            end_date: { type: 'string', description: '结束日期，格式 YYYYMMDD' },
            limit: { type: 'number', description: '返回条数限制，默认20' },
          },
          required: [],
        },
      }),
    ];
  }

  async getStockDaily(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      if (params.limit) apiParams.limit = params.limit;
      else apiParams.limit = 20;
      const data = await this.tushareRequest(
        'daily',
        apiParams,
        'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:getStockDaily] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async getIndexDaily(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      if (params.limit) apiParams.limit = params.limit;
      else apiParams.limit = 20;
      const data = await this.tushareRequest(
        'index_daily',
        apiParams,
        'ts_code,trade_date,close,open,high,low,pre_close,change,pct_chg,vol,amount',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:getIndexDaily] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async getFuturesDaily(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      if (params.limit) apiParams.limit = params.limit;
      else apiParams.limit = 20;
      const data = await this.tushareRequest(
        'fut_daily',
        apiParams,
        'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount,oi',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '期货日线接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getFuturesDaily] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }
  async getMarketOverview(params: {
    trade_date: string;
    exchange?: string;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {
        trade_date: params.trade_date,
      };
      if (params.exchange) apiParams.exchange = params.exchange;
      const data = await this.tushareRequest('daily_info', apiParams);
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(
        `[Tool:getMarketOverview] ${error.message}`,
        error.stack,
      );
      return JSON.stringify({ error: error.message });
    }
  }

  async getTopList(params: { trade_date: string }): Promise<string> {
    try {
      const data = await this.tushareRequest(
        'top_list',
        { trade_date: params.trade_date },
        'trade_date,ts_code,name,close,pct_change,turnover_rate,amount,l_sell,l_buy,l_amount,net_amount,reason',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:getTopList] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async getFundNav(params: {
    ts_code?: string;
    end_date?: string;
    market?: string;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.end_date) apiParams.end_date = params.end_date;
      if (params.market) apiParams.market = params.market;
      const data = await this.tushareRequest(
        'fund_nav',
        apiParams,
        'ts_code,ann_date,end_date,unit_nav,accum_nav,accum_div,net_asset,total_netasset,adj_nav',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '基金净值接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getFundNav] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getGlobalIndex(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'index_global',
        apiParams,
        'ts_code,trade_date,open,close,high,low,pre_close,change,pct_chg,swing,vol',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:getGlobalIndex] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async getMarginData(params: {
    trade_date?: string;
    exchange_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.exchange_id) apiParams.exchange_id = params.exchange_id;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'margin',
        apiParams,
        'trade_date,exchange_id,rzye,rzmre,rzche,rqye,rqmcl,rzrqye,rqyl',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '融资融券接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getMarginData] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getNorthboundFlow(params: {
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'moneyflow_hsgt',
        apiParams,
        'trade_date,ggt_ss,ggt_sz,hgt,sgt,north_money,south_money',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '沪深港通资金接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getNorthboundFlow] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getSectorDaily(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 30;
      const data = await this.tushareRequest(
        'ths_daily',
        apiParams,
        'ts_code,name,trade_date,close,open,high,low,pre_close,avg_price,change,pct_change,vol,turnover_rate',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '同花顺板块接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getSectorDaily] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getLimitList(params: {
    trade_date: string;
    limit_type?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {
        trade_date: params.trade_date,
      };
      if (params.limit_type) apiParams.limit_type = params.limit_type;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'limit_list_d',
        apiParams,
        'trade_date,ts_code,name,close,pct_chg,fd_amount,first_time,last_time,open_times,up_stat,limit_times',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '涨跌停统计接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getLimitList] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getTreasuryYield(params: {
    ts_code?: string;
    curve_type?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.curve_type) apiParams.curve_type = params.curve_type;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'yc_cb',
        apiParams,
        'trade_date,ts_code,curve_type,curve_term,yield',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '国债收益率接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getTreasuryYield] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }

  async getShibor(params: {
    date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.date) apiParams.date = params.date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'shibor',
        apiParams,
        'date,on,1w,2w,1m,3m,6m,9m,1y',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      this.logger.error(`[Tool:getShibor] ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message });
    }
  }

  async getForexDaily(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<string> {
    try {
      const apiParams: Record<string, any> = {};
      if (params.ts_code) apiParams.ts_code = params.ts_code;
      if (params.trade_date) apiParams.trade_date = params.trade_date;
      if (params.start_date) apiParams.start_date = params.start_date;
      if (params.end_date) apiParams.end_date = params.end_date;
      apiParams.limit = params.limit || 20;
      const data = await this.tushareRequest(
        'fx_daily',
        apiParams,
        'ts_code,trade_date,bid_open,bid_close,bid_high,bid_low,ask_open,ask_close,ask_high,ask_low,tick_qty',
      );
      return JSON.stringify(data);
    } catch (error: any) {
      const msg = error.message.includes('权限')
        ? '外汇日线接口需要较高Tushare积分，请升级账户后重试'
        : error.message;
      this.logger.error(`[Tool:getForexDaily] ${msg}`, error.stack);
      return JSON.stringify({ error: msg });
    }
  }
}
