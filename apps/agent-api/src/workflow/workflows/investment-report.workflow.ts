import { workflowId } from '../workflow.decorator';
import { BaseWorkflow, WorkflowDsl } from '../base-workflow';

@workflowId('investment-report-workflow-01')
export class InvestmentReportWorkflow extends BaseWorkflow {
  readonly name = '投资日报生成';
  readonly description =
    '自动获取全球股票、期货、债券、外汇、数字货币行情及市场新闻，生成结构化的每日投资报告（12大板块）';

  getDsl(): WorkflowDsl {
    return {
      id: 'investmentReportWorkflow',
      name: this.name,
      description: this.description,
      version: 'v2',
      tools: [
        // 现有 TuShare
        'getIndexDaily', 'getStockDaily', 'getMarketOverview', 'getTopList',
        'getFuturesDaily', 'getFundNav',
        // TuShare 新增
        'getGlobalIndex', 'getMarginData', 'getNorthboundFlow',
        'getSectorDaily', 'getLimitList', 'getTreasuryYield',
        'getShibor', 'getForexDaily',
        // CoinGecko
        'getCryptoMarket', 'getCryptoGlobal', 'getCryptoFearGreed',
        // Tavily
        'searchWeb',
      ],
      agents: [
        {
          name: 'ReportAnalyst',
          description: '专业投资分析师，根据全球市场数据生成结构化投资日报（12大板块）',
          prompt: `你是一位专业的投资分析师。请根据提供的市场数据，严格按照以下12个板块结构生成每日投资报告。

报告结构：
1. 【隔夜海外市场】：美股三大指数(道琼斯、标普500、纳斯达克)、VIX恐慌指数、欧洲主要指数(富时100、DAX、CAC40)表现及热点摘要
2. 【A股市场总览】：主要指数表现(上证、深证、创业板、科创综指)、成交量变化、两融余额、北向资金流向
3. 【热点板块】：领涨板块(不少于3个)及驱动逻辑、主要回调板块
4. 【重要个股动态】：涨停/跌停统计、龙虎榜异动个股、重大公告
5. 【大宗商品与期货】：贵金属(黄金、白银)、能源(原油、天然气)、工业金属(铜、螺纹钢)、农产品走势
6. 【国内债券市场】：国债收益率曲线(1Y/5Y/10Y/30Y)、SHIBOR利率、央行公开市场操作
7. 【数字货币】：BTC/ETH/SOL等主流币价格、24h涨跌幅、总市值、恐惧贪婪指数
8. 【宏观政策与新闻】：国内外重要政策和经济数据，每条附市场影响评估
9. 【外汇市场】：美元指数、在岸/离岸人民币汇率、主要货币对
10. 【机构策略观点】：不少于3家券商/基金最新研判，附核心配置主线
11. 【明日重要日程】：经济数据发布、重要会议、IPO等（不少于3条）
12. 【风险提示】：当前市场主要风险因素（不少于3条，需具体可量化）

风格要求：
- 使用Markdown表格呈现数据，保持格式规范
- 简洁专业，数据驱动，包含具体涨跌幅数据（百分比格式如 +1.23% / -0.45%）
- 对异常波动给出分析判断
- 如果某类数据缺失（如接口权限不足），跳过该板块并说明
- 中文输出`,
          output: { report: 'string' },
          tools: [],
        },
      ],
      events: [
        { type: 'WORKFLOW_START', data: { tradeDate: 'string' } },
        { type: 'FETCH_ASTOCK' },
        { type: 'FETCH_SECTORS_STOCKS' },
        { type: 'FETCH_COMMODITIES' },
        { type: 'FETCH_BONDS' },
        { type: 'FETCH_CRYPTO' },
        { type: 'FETCH_FOREX' },
        { type: 'FETCH_NEWS' },
        { type: 'GENERATE_REPORT' },
        { type: 'WORKFLOW_STOP', data: { result: 'string' } },
      ],
      steps: [
        // Step 1: 海外市场（章节1）
        {
          event: 'WORKFLOW_START',
          handle: `async (event, context) => {
            const today = new Date();
            const tradeDate = event.data.tradeDate || today.getFullYear().toString() +
              String(today.getMonth() + 1).padStart(2, '0') +
              String(today.getDate()).padStart(2, '0');

            const globalCodes = ['DJI', 'XIN9', 'IXIC', 'CBOE_VIX', 'FTSE', 'GDAXI', 'FCHI'];
            const overseasData = [];
            for (const code of globalCodes) {
              try {
                const result = await getGlobalIndex.call({ ts_code: code, trade_date: tradeDate, limit: 1 });
                const parsed = JSON.parse(result);
                if (Array.isArray(parsed) && parsed.length > 0) overseasData.push(parsed[0]);
              } catch (e) { /* skip */ }
            }

            return { type: 'FETCH_ASTOCK', data: { tradeDate, overseasData } };
          }`,
        },
        // Step 2: A股总览（章节2）
        {
          event: 'FETCH_ASTOCK',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;

            const indexCodes = ['000001.SH', '399001.SZ', '399006.SZ', '000688.SH'];
            const indexData = [];
            for (const code of indexCodes) {
              try {
                const result = await getIndexDaily.call({ ts_code: code, trade_date: tradeDate, limit: 1 });
                const parsed = JSON.parse(result);
                if (Array.isArray(parsed) && parsed.length > 0) indexData.push(parsed[0]);
              } catch (e) { /* skip */ }
            }

            let marketOverview = null;
            try {
              const result = await getMarketOverview.call({ trade_date: tradeDate });
              marketOverview = JSON.parse(result);
            } catch (e) { marketOverview = { error: e.message }; }

            let marginData = null;
            try {
              const result = await getMarginData.call({ trade_date: tradeDate });
              marginData = JSON.parse(result);
            } catch (e) { marginData = { error: e.message }; }

            let northboundData = null;
            try {
              const result = await getNorthboundFlow.call({ trade_date: tradeDate });
              northboundData = JSON.parse(result);
            } catch (e) { northboundData = { error: e.message }; }

            return {
              type: 'FETCH_SECTORS_STOCKS',
              data: { ...event.data, indexData, marketOverview, marginData, northboundData }
            };
          }`,
        },
        // Step 3: 板块 + 个股（章节3、4）
        {
          event: 'FETCH_SECTORS_STOCKS',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;

            let sectorData = null;
            try {
              const result = await getSectorDaily.call({ trade_date: tradeDate, limit: 30 });
              sectorData = JSON.parse(result);
            } catch (e) { sectorData = { error: e.message }; }

            let topList = null;
            try {
              const result = await getTopList.call({ trade_date: tradeDate });
              topList = JSON.parse(result);
            } catch (e) { topList = { error: e.message }; }

            let limitUpList = null;
            try {
              const result = await getLimitList.call({ trade_date: tradeDate, limit_type: 'U', limit: 20 });
              limitUpList = JSON.parse(result);
            } catch (e) { limitUpList = { error: e.message }; }

            let limitDownList = null;
            try {
              const result = await getLimitList.call({ trade_date: tradeDate, limit_type: 'D', limit: 20 });
              limitDownList = JSON.parse(result);
            } catch (e) { limitDownList = { error: e.message }; }

            return {
              type: 'FETCH_COMMODITIES',
              data: { ...event.data, sectorData, topList, limitUpList, limitDownList }
            };
          }`,
        },
        // Step 4: 大宗商品（章节5）
        {
          event: 'FETCH_COMMODITIES',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;

            let futuresData = [];
            try {
              const result = await getFuturesDaily.call({ trade_date: tradeDate, limit: 30 });
              const parsed = JSON.parse(result);
              futuresData = parsed.error ? [parsed] : parsed;
            } catch (e) { futuresData = [{ error: e.message }]; }

            let intlCommodities = null;
            try {
              const result = await searchWeb.call({
                query: '今日国际大宗商品价格 黄金 原油 铜 WTI布伦特 LME',
                max_results: 3, include_answer: true
              });
              intlCommodities = JSON.parse(result);
            } catch (e) { intlCommodities = { error: e.message }; }

            return {
              type: 'FETCH_BONDS',
              data: { ...event.data, futuresData, intlCommodities }
            };
          }`,
        },
        // Step 5: 债券市场（章节6）
        {
          event: 'FETCH_BONDS',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;

            let treasuryYield = null;
            try {
              const result = await getTreasuryYield.call({
                ts_code: '1001.CB', curve_type: '0', trade_date: tradeDate
              });
              treasuryYield = JSON.parse(result);
            } catch (e) { treasuryYield = { error: e.message }; }

            let shiborData = null;
            try {
              const result = await getShibor.call({ date: tradeDate });
              shiborData = JSON.parse(result);
            } catch (e) { shiborData = { error: e.message }; }

            return {
              type: 'FETCH_CRYPTO',
              data: { ...event.data, treasuryYield, shiborData }
            };
          }`,
        },
        // Step 6: 数字货币（章节7）
        {
          event: 'FETCH_CRYPTO',
          handle: `async (event, context) => {
            let cryptoMarket = null;
            try {
              const result = await getCryptoMarket.call({
                ids: 'bitcoin,ethereum,solana,binancecoin,ripple',
                vs_currency: 'usd', per_page: 10
              });
              cryptoMarket = JSON.parse(result);
            } catch (e) { cryptoMarket = { error: e.message }; }

            let cryptoGlobal = null;
            try {
              const result = await getCryptoGlobal.call({});
              cryptoGlobal = JSON.parse(result);
            } catch (e) { cryptoGlobal = { error: e.message }; }

            let fearGreed = null;
            try {
              const result = await getCryptoFearGreed.call({ limit: 1 });
              fearGreed = JSON.parse(result);
            } catch (e) { fearGreed = { error: e.message }; }

            return {
              type: 'FETCH_FOREX',
              data: { ...event.data, cryptoMarket, cryptoGlobal, fearGreed }
            };
          }`,
        },
        // Step 7: 外汇市场（章节9）
        {
          event: 'FETCH_FOREX',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;

            const forexCodes = ['USDCNY.FXCM', 'USDCNH.FXCM', 'EURUSD.FXCM', 'USDJPY.FXCM', 'GBPUSD.FXCM'];
            const forexData = [];
            for (const code of forexCodes) {
              try {
                const result = await getForexDaily.call({ ts_code: code, trade_date: tradeDate, limit: 1 });
                const parsed = JSON.parse(result);
                if (Array.isArray(parsed) && parsed.length > 0) forexData.push(parsed[0]);
              } catch (e) { /* skip */ }
            }

            let dxyData = null;
            try {
              const result = await getGlobalIndex.call({ ts_code: 'DXY', trade_date: tradeDate, limit: 1 });
              const parsed = JSON.parse(result);
              if (Array.isArray(parsed) && parsed.length > 0) dxyData = parsed[0];
            } catch (e) { /* skip */ }

            return {
              type: 'FETCH_NEWS',
              data: { ...event.data, forexData, dxyData }
            };
          }`,
        },
        // Step 8: 新闻、机构观点、明日日程（章节8、10、11）
        {
          event: 'FETCH_NEWS',
          handle: `async (event, context) => {
            const queries = [
              { key: 'macroPolicy', query: '今日宏观经济政策 央行 财政部 国务院' },
              { key: 'marketNews', query: '今日A股市场重要新闻 公告 热点' },
              { key: 'institutionalViews', query: '券商策略观点 机构研报 市场展望' },
              { key: 'tomorrowSchedule', query: '明日财经日程 数据发布 重要会议' },
              { key: 'intlNews', query: '美联储 欧央行 国际经济政策动态' },
            ];
            const newsData = {};
            for (const { key, query } of queries) {
              try {
                const result = await searchWeb.call({ query, max_results: 3, include_answer: true });
                const parsed = JSON.parse(result);
                newsData[key] = {
                  answer: parsed.answer,
                  results: (parsed.results || []).slice(0, 3).map(r => ({
                    title: r.title, content: r.content, url: r.url
                  }))
                };
              } catch (e) { newsData[key] = { error: e.message }; }
            }

            return { type: 'GENERATE_REPORT', data: { ...event.data, newsData } };
          }`,
        },
        // Step 9: 生成报告（全部12章节）
        {
          event: 'GENERATE_REPORT',
          handle: `async (event, context) => {
            const dataStr = JSON.stringify(event.data, null, 2);
            const prompt = '请根据以下市场数据生成今日投资日报（严格按12个板块结构输出）：\\n\\n' + dataStr;
            const response = await ReportAnalyst.run(prompt);
            const raw = response.data.result || '';
            let report = raw;
            try {
              const parsed = JSON.parse(raw);
              report = parsed.report || Object.values(parsed)[0] || raw;
            } catch (e) {
              // 不是 JSON，直接用原始文本
            }
            return {
              type: 'WORKFLOW_STOP',
              data: { result: report || 'empty' }
            };
          }`,
        },
      ],
    };
  }
}
