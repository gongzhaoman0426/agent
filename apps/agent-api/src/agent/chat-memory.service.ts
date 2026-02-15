import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorStoreIndex, Settings } from 'llamaindex';
import { OpenAIEmbedding } from '@llamaindex/openai';
import { anthropic, AnthropicSession } from '@llamaindex/anthropic';
import { PGVectorStore } from '@llamaindex/postgres';
import { TextNode } from 'llamaindex';
import { LlamaindexService } from '../llamaindex/llamaindex.service';

interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
}

interface MemoryResult {
  enhancedPrompt: string;
  recentHistory: ChatMessageItem[];
}

/** 时间衰减系数，每小时衰减率 */
const TIME_DECAY_LAMBDA = 0.005;
/** 摘要条数上限，超过则合并最老的 3 条 */
const MAX_SUMMARIES = 8;
/** 未压缩轮次达到此值时触发压缩 */
const COMPACTION_THRESHOLD = 10;
/** 每次压缩的轮次数 */
const COMPACTION_TURNS = 5;

@Injectable()
export class ChatMemoryService {
  private readonly logger = new Logger('ChatMemory');

  constructor(
    private readonly prisma: PrismaService,
    private readonly llamaIndexService: LlamaindexService,
  ) {}

  private ensureSettings() {
    Settings.embedModel = new OpenAIEmbedding({
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });
    const session = new AnthropicSession({
      apiKey: process.env.ANTHROPIC_API_KEY,
      ...(process.env.ANTHROPIC_BASE_URL && { baseURL: process.env.ANTHROPIC_BASE_URL }),
    });
    Settings.llm = anthropic({
      model: 'claude-sonnet-4.6',
      temperature: 0.7,
      apiKey: process.env.ANTHROPIC_API_KEY,
      session,
    });
  }

  private getCollectionName(agentId: string): string {
    return `chat_memory_${agentId}`;
  }

  private async createVectorStore(agentId: string): Promise<PGVectorStore> {
    this.ensureSettings();
    const pgVectorStore = new PGVectorStore({
      clientConfig: {
        connectionString: process.env.DATABASE_URL,
      },
      dimensions: 1536,
      performSetup: true,
    });
    pgVectorStore.setCollection(this.getCollectionName(agentId));
    return pgVectorStore;
  }

  private async createIndex(vectorStore: PGVectorStore): Promise<VectorStoreIndex> {
    return await VectorStoreIndex.fromVectorStore(vectorStore);
  }

  // ─── 摘要方法 ───

  /**
   * 将对话轮次压缩为 1 条摘要
   */
  private async summarizeTurns(messages: ChatMessageItem[]): Promise<string> {
    const conversationBlock = messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');

    const prompt = `你是一个对话摘要助手。请将以下对话内容压缩为一段简洁的摘要。

需要摘要的对话内容:
${conversationBlock}

要求:
1. 保留关键事实、用户偏好、做出的决定、工具调用结果等重要信息
2. 去除寒暄、重复内容和不重要的细节
3. 摘要应为第三人称叙述，不超过 500 字
4. 只输出摘要内容，不要加任何前缀或解释`;

    return this.llamaIndexService.chat(prompt, '你是一个专业的对话摘要助手，擅长提取关键信息并生成简洁摘要。');
  }

  /**
   * 将多条摘要合并为 1 条
   */
  private async mergeSummaries(summaryTexts: string[]): Promise<string> {
    const block = summaryTexts.map((s, i) => `[摘要 ${i + 1}]\n${s}`).join('\n\n');

    const prompt = `你是一个对话摘要助手。请将以下多段对话摘要合并为一段完整的摘要。

${block}

要求:
1. 将所有摘要合并为一个连贯的叙述
2. 保留关键决策、事实、用户偏好和重要结论
3. 去除重复信息，按时间顺序组织
4. 合并后不超过 800 字
5. 只输出合并后的摘要，不要加任何前缀或解释`;

    return this.llamaIndexService.chat(prompt, '你是一个专业的对话摘要助手，擅长合并多段摘要并保留关键信息。');
  }

  // ─── 核心方法 ───

  /**
   * 处理聊天记忆：滑动窗口 + 两级压缩 + RAG 检索 + 增强 prompt
   */
  async processMemory(
    agentId: string,
    sessionId: string,
    currentMessage: string,
    fullHistory: ChatMessageItem[],
    systemPrompt: string,
  ): Promise<MemoryResult> {
    this.logger.log(`[processMemory] agent=${agentId}, session=${sessionId}, 历史消息数=${fullHistory.length}, 当前消息="${currentMessage.substring(0, 80)}"`);

    // 1. 查询当所有摘要，按 turnStart 升序
    let summaries = await this.prisma.sessionSummary.findMany({
      where: { sessionId },
      orderBy: { turnStart: 'asc' },
    });

    // 2. 计算已摘要的轮次数
    const summarizedTurnCount = summaries.length > 0
      ? summaries[summaries.length - 1].turnEnd + 1
      : 0;

    // 3. 提取未摘要的消息
    const unsummarizedMessages = fullHistory.slice(summarizedTurnCount * 2);
    const unsummarizedTurns = Math.floor(unsummarizedMessages.length / 2);
    this.logger.log(`[processMemory] 已摘要轮次=${summarizedTurnCount}, 未摘要轮次=${unsummarizedTurns}, 摘要条数=${summaries.length}`);

    let recentHistory: ChatMessageItem[];

    // 4. 对话轮次压缩（达到 10 轮触发）
    if (unsummarizedTurns >= COMPACTION_THRESHOLD) {
      const messagesToSummarize = unsummarizedMessages.slice(0, COMPACTION_TURNS * 2);
      const remainingMessages = unsummarizedMessages.slice(COMPACTION_TURNS * 2);

      try {
        const summaryText = await this.summarizeTurns(messagesToSummarize);
        await this.prisma.sessionSummary.create({
          data: {
            sessionId,
            agentId,
            content: summaryText,
            turnStart: summarizedTurnCount,
            turnEnd: summarizedTurnCount + COMPACTION_TURNS - 1,
          },
        });
        this.logger.log(`[processMemory] 压缩完成: 轮次 ${summarizedTurnCount}-${summarizedTurnCount + COMPACTION_TURNS - 1} → 1 条摘要`);
        recentHistory = remainingMessages;

        // 重新查询摘要列表
        summaries = await this.prisma.sessionSummary.findMany({
          where: { sessionId },
          orderBy: { turnStart: 'asc' },
        });
      } catch (error) {
        this.logger.warn(`[processMemory] 压缩失败，使用全部未摘要消息: ${error}`);
        recentHistory = unsummarizedMessages;
      }
    } else {
      recentHistory = unsummarizedMessages;
    }

    // 5. 摘要合并（超过 8 条触发，最老 3 条 → 1 条）
    if (summaries.length > MAX_SUMMARIES) {
      const oldest3 = summaries.slice(0, 3);
      try {
        const mergedText = await this.mergeSummaries(oldest3.map((s) => s.content));
        // 事务：删除旧的 3 条 + 插入合并后的 1 条
        await this.prisma.$transaction([
          this.prisma.sessionSummary.deleteMany({
            where: { id: { in: oldest3.map((s) => s.id) } },
          }),
          this.prisma.sessionSummary.create({
            data: {
              sessionId,
              agentId,
              content: mergedText,
              turnStart: oldest3[0].turnStart,
              turnEnd: oldest3[2].turnEnd,
            },
          }),
        ]);
        this.logger.log(`[processMemory] 摘要合并: ${oldest3.length} 条 → 1 条 (轮次 ${oldest3[0].turnStart}-${oldest3[2].turnEnd})`);

        // 重新查询
        summaries = await this.prisma.sessionSummary.findMany({
          where: { sessionId },
          orderBy: { turnStart: 'asc' },
        });
      } catch (error) {
        this.logger.warn(`[processMemory] 摘要合并失败，跳过: ${error}`);
      }
    }

    // 6. 构建 enhancedPrompt
    const contextParts = [systemPrompt];

    // 拼接所有摘要
    if (summaries.length > 0) {
      const summaryBlock = summaries
        .map((s, i) => `[摘要 ${i + 1}] ${s.content}`)
        .join('\n');
      contextParts.push(
        '\n\n## 当前会话历史摘要\n以下是本次会话中较早对话的摘要，供你了解上下文背景:\n' +
        summaryBlock,
      );
    }

    // RAG 检索相关旧对话（仅跨 Session）
    try {
      const relevantDocs = await this.retrieveRelevantHistory(agentId, sessionId, currentMessage);
      if (relevantDocs.length > 0) {
        contextParts.push(
          '\n\n## 相关历史对话记忆\n以下是与当前话题相关的历史对话片段，仅供参考背景信息。' +
          '重要：当用户要求执行工作流、查询数据、调用工具等操作时，你必须实际调用对应的工具来完成，不能仅凭历史记忆回复。历史记忆中的结果可能已过时。\n' +
          relevantDocs.map((doc, i) => `[记忆 ${i + 1}] ${doc}`).join('\n'),
        );
        this.logger.log(`[processMemory] 检索到 ${relevantDocs.length} 条跨session相关记忆`);
      } else {
        this.logger.log(`[processMemory] 未检索到跨session相关记忆`);
      }
    } catch (error) {
      this.logger.warn(`[processMemory] RAG 检索失败，跳过记忆增强: ${error}`);
    }

    const enhancedPrompt = contextParts.join('');
    this.logger.log(`[processMemory] prompt 长度: 原始=${systemPrompt.length}, 增强后=${enhancedPrompt.length}, recentHistory=${recentHistory.length} 条`);

    return { enhancedPrompt, recentHistory };
  }

  /**
   * RAG 检索 Agent 级别的历史对话（仅跨 Session），带时间衰减权重
   */
  async retrieveRelevantHistory(agentId: string, sessionId: string, query: string): Promise<string[]> {
    this.logger.log(`[retrieveRelevantHistory] agent=${agentId}, session=${sessionId}, query="${query.substring(0, 80)}"`);

    const vectorStore = await this.createVectorStore(agentId);
    const index = await this.createIndex(vectorStore);

    const retriever = index.asRetriever({ similarityTopK: 20 });
    const nodes = await retriever.retrieve(query);

    this.logger.log(`[retrieveRelevantHistory] 向量检索返回 ${nodes.length} 条结果`);

    if (nodes.length === 0) {
      return [];
    }

    // 完全排除当前 session 的所有结果
    const filtered = nodes.filter(
      (n: any) => n.node?.metadata?.session_id !== sessionId,
    );

    this.logger.log(`[retrieveRelevantHistory] 排除当前session后剩余 ${filtered.length} 条`);

    if (filtered.length === 0) {
      return [];
    }

    // 对检索结果应用时间衰减（后处理）
    const now = Date.now();
    const withDecay = filtered.map((n: any) => {
      const timestamp = n.node?.metadata?.timestamp || now;
      const ageInHours = (now - timestamp) / (1000 * 60 * 60);
      const decayFactor = Math.exp(-TIME_DECAY_LAMBDA * ageInHours);
      const originalScore = n.score || 0;
      return {
        ...n,
        originalScore,
        score: originalScore * decayFactor,
        decayFactor,
      };
    });

    // 按加权分数降序排序
    withDecay.sort((a: any, b: any) => b.score - a.score);

    // 筛选策略：取 score > 0.85 的条目，或 top 6，取两者中更多的
    const highScoreNodes = withDecay.filter((n: any) => n.score > 0.85);
    const top6 = withDecay.slice(0, 6);
    const selected = highScoreNodes.length > top6.length ? highScoreNodes : top6;
    this.logger.log(`[retrieveRelevantHistory] 筛选: highScore(>0.85)=${highScoreNodes.length}, top6=${top6.length}, 最终选取=${selected.length}`);

    // 按 timestamp 升序排列（时间顺序呈现）
    const sorted = selected.sort((a: any, b: any) => {
      const tsA = a.node?.metadata?.timestamp || 0;
      const tsB = b.node?.metadata?.timestamp || 0;
      return tsA - tsB;
    });

    return sorted.map((n: any) => {
      const text = n.node?.text || n.node?.getContent?.() || '';
      const ws = (n.score || 0).toFixed(4);
      const os = (n.originalScore || 0).toFixed(4);
      const df = (n.decayFactor || 0).toFixed(4);
      this.logger.log(`[retrieveRelevantHistory] weightedScore=${ws}, originalScore=${os}, decay=${df}, text=${text.substring(0, 80)}...`);
      return text;
    });
  }

  /**
   * 删除指定 session 的所有向量化记忆和摘要
   */
  async deleteSessionMemory(agentId: string, sessionId: string): Promise<void> {
    try {
      const collection = this.getCollectionName(agentId);
      const result = await this.prisma.$executeRawUnsafe(
        `DELETE FROM public.llamaindex_embedding WHERE collection = $1 AND metadata->>'session_id' = $2 AND metadata->>'type' = 'chat_memory'`,
        collection,
        sessionId,
      );
      // 同时删除该 session 的所有摘要
      const summaryResult = await this.prisma.sessionSummary.deleteMany({
        where: { sessionId },
      });
      this.logger.log(
        `[deleteSessionMemory] 删除 session=${sessionId} 的 ${result} 条向量记忆, ${summaryResult.count} 条摘要`,
      );
    } catch (error) {
      this.logger.error(`[deleteSessionMemory] 删除失败: ${error}`);
    }
  }

  /**
   * 异步向量化较早的 Q&A 对（不阻塞响应）
   */
  async vectorizeOlderPairs(
    agentId: string,
    sessionId: string,
    fullHistory: ChatMessageItem[],
  ): Promise<void> {
    try {
      this.logger.log(`[vectorizeOlderPairs] 开始处理 agent=${agentId}, session=${sessionId}, 历史消息数=${fullHistory.length}`);

      // 提取所有 Q&A 对
      const pairs: Array<{ index: number; user: string; assistant: string }> = [];
      let pairIndex = 0;
      for (let i = 0; i < fullHistory.length - 1; i++) {
        if (fullHistory[i].role === 'user' && fullHistory[i + 1].role === 'assistant') {
          pairs.push({
            index: pairIndex++,
            user: fullHistory[i].content,
            assistant: fullHistory[i + 1].content,
          });
        }
      }

      this.logger.log(`[vectorizeOlderPairs] 提取到 ${pairs.length} 个 Q&A 对`);

      if (pairs.length === 0) {
        this.logger.log(`[vectorizeOlderPairs] 无 Q&A 对，跳过向量化`);
        return;
      }

      // 查询已处理的去重标识
      const collection = this.getCollectionName(agentId);
      const existingRows: Array<{ metadata: any }> = await this.prisma.$queryRawUnsafe(
        `SELECT metadata FROM public.llamaindex_embedding WHERE collection = $1 AND metadata->>'session_id' = $2 AND metadata->>'type' = 'chat_memory'`,
        collection,
        sessionId,
      );
      const existingKeys = new Set(
        existingRows.map((r) => `${r.metadata?.session_id}_${r.metadata?.pair_index}`),
      );

      // 过滤已处理的
      const newPairs = pairs.filter(
        (p) => !existingKeys.has(`${sessionId}_${p.index}`),
      );

      if (newPairs.length === 0) {
        this.logger.log(`[vectorizeOlderPairs] 无新的 Q&A 对需要向量化`);
        return;
      }

      this.logger.log(
        `[vectorizeOlderPairs] 准备向量化 ${newPairs.length} 个 Q&A 对 (agent=${agentId}, session=${sessionId})`,
      );

      // 构建 TextNode
      const nodes = newPairs.map((p) => {
        const text = `用户: ${p.user}\n助手: ${p.assistant}`;
        const node = new TextNode({
          text,
          metadata: {
            session_id: sessionId,
            agent_id: agentId,
            pair_index: p.index,
            type: 'chat_memory',
            timestamp: Date.now(),
          },
        });
        return node;
      });

      const vectorStore = await this.createVectorStore(agentId);
      const index = await this.createIndex(vectorStore);
      await index.insertNodes(nodes);

      this.logger.log(
        `[vectorizeOlderPairs] 成功向量化 ${nodes.length} 个 Q&A 对`,
      );
    } catch (error) {
      this.logger.error(`[vectorizeOlderPairs] 向量化失败: ${error}`);
    }
  }
}
