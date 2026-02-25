import { workflowId } from '../workflow.decorator';
import { BaseWorkflow, WorkflowDsl } from '../base-workflow';

@workflowId('investment-report-workflow-01')
export class InvestmentReportWorkflow extends BaseWorkflow {
  readonly name = '投资日报生成';
  readonly description =
    '自动获取全球股票、期货、债券、数字货币行情及市场新闻，生成结构化的每日投资报告';

  getDsl(): WorkflowDsl {
    return {
      id: 'investmentReportWorkflow',
      name: this.name,
      description: this.description,
      version: 'v3',
      tools: [
        // Tushare（已验证可用）
        'getStockDaily', 'getFuturesDaily', 'getNorthboundFlow', 'getShibor',
        // CoinGecko
        'getCryptoMarket', 'getCryptoGlobal', 'getCryptoFearGreed',
        // Tavily
        'searchWeb',
      ],
      agents: [
        {
          name: 'ReportAnalyst',
          description: '专业投资分析师，根据全球市场数据生成结构化投资日报',
          prompt: `你是一位专业的投资分析师。请根据提供的市场数据，严格按照以下板块结构生成每日投资报告。

报告结构：
1. 【隔夜美股表现】：道琼斯、标普500、纳斯达克、VIX恐慌指数
2. 【大宗商品】：国际黄金、WTI原油、LME铜、天然气
3. 【国内利率市场】：SHIBOR各期限利率、央行公开市场操作
4. 【数字货币】：BTC/ETH等主流币价格、24h涨跌幅、总市值、恐惧贪婪指数
5. 【A股市场表现】：主要指数、成交额、北向资金、涨跌家数、强势/弱势板块
6. 【商品期货表现】：贵金属(沪金/沪银)、黑色系(螺纹/铁矿/焦煤)、有色(铜/铝)、能化(原油/纯碱)、农产品(豆粕/生猪)
7. 【宏观政策与新闻】：国内外重要政策和经济数据
8. 【核心结论】：全球风险偏好、流动性环境、A股风格方向、市场主线
9. 【风险提示】：不少于3条具体风险因素

风格要求：
- 使用Markdown表格呈现数据，保持格式规范
- 简洁专业，数据驱动，包含具体涨跌幅数据（百分比格式如 +1.23% / -0.45%）
- 对异常波动给出分析判断
- 中文输出`,
          output: { report: 'string' },
          tools: [],
        },
      ],
      events: [
        { type: 'WORKFLOW_START', data: { tradeDate: 'string' } },
        { type: 'FETCH_TUSHARE_DATA' },
        { type: 'FETCH_SEARCH_DATA' },
        { type: 'FETCH_CRYPTO' },
        { type: 'GENERATE_REPORT' },
        { type: 'WORKFLOW_STOP', data: { result: 'string' } },
      ],
      steps: [
        // Step 1: Tushare 数据（期货 + 北向资金 + Shibor）
        {
          event: 'WORKFLOW_START',
          handle: `async (event, context) => {
            const today = new Date();
            const tradeDate = event.data.tradeDate || today.getFullYear().toString() +
              String(today.getMonth() + 1).padStart(2, '0') +
              String(today.getDate()).padStart(2, '0');

            // 期货：批量查询所有品种
            const futuresCodes = ['AU.SHF','AG.SHF','CU.SHF','AL.SHF','RB.SHF','I.DCE','JM.DCE','M.DCE','LH.DCE','SC.INE','SA.CZC'];
            const futuresData = [];
            for (const code of futuresCodes) {
              try {
                const result = await getFuturesDaily.call({ ts_code: code, trade_date: tradeDate, limit: 1 });
                const parsed = JSON.parse(result);
                if (Array.isArray(parsed) && parsed.length > 0) futuresData.push(parsed[0]);
              } catch (e) { /* skip */ }
            }

            // 北向资金
            let northboundData = null;
            try {
              const result = await getNorthboundFlow.call({ trade_date: tradeDate, limit: 1 });
              northboundData = JSON.parse(result);
            } catch (e) { northboundData = { error: e.message }; }

            // Shibor
            let shiborData = null;
            try {
              const result = await getShibor.call({ date: tradeDate });
              shiborData = JSON.parse(result);
            } catch (e) { shiborData = { error: e.message }; }

            return {
              type: 'FETCH_SEARCH_DATA',
              data: { tradeDate, futuresData, northboundData, shiborData }
            };
          }`,
        },
        // Step 2: Tavily 搜索补充（美股、A股指数、大宗商品、新闻）
        {
          event: 'FETCH_SEARCH_DATA',
          handle: `async (event, context) => {
            const { tradeDate } = event.data;
            const dateStr = tradeDate.slice(0,4) + '年' + tradeDate.slice(4,6) + '月' + tradeDate.slice(6,8) + '日';

            const searches = [
              { key: 'usMarket', query: dateStr + ' 美股收盘 道琼斯 标普500 纳斯达克 VIX' },
              { key: 'aShareMarket', query: dateStr + ' A股 上证指数 深证成指 创业板 成交额 涨跌家数 热点板块 弱势板块' },
              { key: 'commodityAndNews', query: dateStr + ' 国际黄金 WTI原油 LME铜 国债收益率 央行公开市场 宏观政策' },
            ];

            const searchData = {};
            for (const { key, query } of searches) {
              try {
                const result = await searchWeb.call({ query, max_results: 5, include_answer: true, search_depth: 'basic' });
                const parsed = JSON.parse(result);
                searchData[key] = {
                  answer: parsed.answer,
                  results: (parsed.results || []).slice(0, 5).map(r => ({
                    title: r.title, content: (r.content || '').slice(0, 500), url: r.url
                  }))
                };
              } catch (e) { searchData[key] = { error: e.message }; }
            }

            return {
              type: 'FETCH_CRYPTO',
              data: { ...event.data, searchData }
            };
          }`,
        },
        // Step 3: 数字货币
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
              type: 'GENERATE_REPORT',
              data: { ...event.data, cryptoMarket, cryptoGlobal, fearGreed }
            };
          }`,
        },
        // Step 4: 生成报告
        {
          event: 'GENERATE_REPORT',
          handle: `async (event, context) => {
            const dataStr = JSON.stringify(event.data, null, 2);
            const prompt = '请根据以下市场数据生成今日投资日报（严格按板块结构输出）：\\n\\n' + dataStr;
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
