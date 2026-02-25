import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

@toolkitId('tushare-toolkit-01')
export class TushareToolkit extends BaseToolkit {
  name = 'Tushare 金融数据';
  description =
    'Tushare Pro 金融数据工具包，支持查询A股行情、期货、北向资金、Shibor等数据';
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
      FunctionTool.from(this.getFuturesDaily.bind(this), {
        name: 'getFuturesDaily',
        description:
          '查询期货日线行情。常用合约代码：AU.SHF(沪金)、AG.SHF(沪银)、CU.SHF(沪铜)、AL.SHF(沪铝)、RB.SHF(螺纹钢)、I.DCE(铁矿石)、JM.DCE(焦煤)、M.DCE(豆粕)、LH.DCE(生猪)、SC.INE(原油)、SA.CZC(纯碱)。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: {
              type: 'string',
              description: '期货合约代码，如 AU.SHF(黄金)、CU.SHF(铜)、RB.SHF(螺纹钢)',
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
      FunctionTool.from(this.getNorthboundFlow.bind(this), {
        name: 'getNorthboundFlow',
        description:
          '查询沪深港通资金流向数据，包括沪股通(hgt)、深股通(sgt)、北向资金净流入(north_money)、南向资金净流入(south_money)等。',
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

}
