import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorStoreIndex, Settings } from 'llamaindex';
import { OpenAIEmbedding, openai } from '@llamaindex/openai';
import { PGVectorStore } from '@llamaindex/postgres';
import { TextNode } from 'llamaindex';

interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
}

interface MemoryResult {
  enhancedPrompt: string;
  recentHistory: ChatMessageItem[];
}

@Injectable()
export class ChatMemoryService {
  private readonly logger = new Logger('ChatMemory');

  constructor(private readonly prisma: PrismaService) {}

  private ensureSettings() {
    Settings.embedModel = new OpenAIEmbedding({
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });
    Settings.llm = openai({
      model: 'gpt-4o',
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
      additionalSessionOptions: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
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

  /**
   * 处理聊天记忆：裁剪历史 + RAG 检索 + 增强 prompt
   */
  async processMemory(
    agentId: string,
    sessionId: string,
    currentMessage: string,
    fullHistory: ChatMessageItem[],
    systemPrompt: string,
  ): Promise<MemoryResult> {
    this.logger.log(`[processMemory] agent=${agentId}, session=${sessionId}, 历史消息数=${fullHistory.length}, 当前消息="${currentMessage.substring(0, 80)}"`);

    // 裁剪：只取最近 10 条作为 recentHistory
    const recentHistory = fullHistory.slice(-10);
    this.logger.log(`[processMemory] 裁剪历史: ${fullHistory.length} → ${recentHistory.length} 条`);

    // RAG 检索相关旧对话（跨 Session）
    let relevantContext = '';
    try {
      const relevantDocs = await this.retrieveRelevantHistory(agentId, sessionId, currentMessage);
      if (relevantDocs.length > 0) {
        relevantContext =
          '\n\n## 相关历史对话记忆\n以下是与当前话题相关的历史对话片段，仅供参考背景信息。' +
          '重要：当用户要求执行工作流、查询数据、调用工具等操作时，你必须实际调用对应的工具来完成，不能仅凭历史记忆回复。历史记忆中的结果可能已过时。\n' +
          relevantDocs.map((doc, i) => `[记忆 ${i + 1}] ${doc}`).join('\n');
        this.logger.log(`[processMemory] 检索到 ${relevantDocs.length} 条相关记忆`);
      } else {
        this.logger.log(`[processMemory] 未检索到相关记忆`);
      }
    } catch (error) {
      this.logger.warn(`[processMemory] RAG 检索失败，跳过记忆增强: ${error}`);
    }

    const enhancedPrompt = systemPrompt + relevantContext;
    this.logger.log(`[processMemory] prompt 长度: 原始=${systemPrompt.length}, 增强后=${enhancedPrompt.length}`);

    return { enhancedPrompt, recentHistory };
  }

  /**
   * RAG 检索 Agent 级别的历史对话（跨 Session），排除当前 session 最近 5 条
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

    // 排除当前 session 最近 5 个 pair（这些已经在 recentHistory 中了）
    const currentSessionNodes = nodes
      .filter((n: any) => n.node?.metadata?.session_id === sessionId)
      .sort((a: any, b: any) => (b.node?.metadata?.pair_index || 0) - (a.node?.metadata?.pair_index || 0));
    const recentPairIndexes = new Set(
      currentSessionNodes.slice(0, 5).map((n: any) => `${n.node?.metadata?.session_id}_${n.node?.metadata?.pair_index}`),
    );

    const filtered = nodes.filter((n: any) => {
      const key = `${n.node?.metadata?.session_id}_${n.node?.metadata?.pair_index}`;
      return !recentPairIndexes.has(key);
    });

    this.logger.log(`[retrieveRelevantHistory] 排除当前session最近5条后剩余 ${filtered.length} 条`);

    if (filtered.length === 0) {
      return [];
    }

    // 筛选策略：取 score > 0.9 的条目，或 top 6，取两者中更多的
    const highScoreNodes = filtered.filter((n: any) => (n.score || 0) > 0.9);
    const top6 = filtered.slice(0, 6);
    const selected = highScoreNodes.length > top6.length ? highScoreNodes : top6;
    this.logger.log(`[retrieveRelevantHistory] 筛选: highScore(>0.9)=${highScoreNodes.length}, top6=${top6.length}, 最终选取=${selected.length}`);

    // 按 metadata 中的 timestamp 排序
    const sorted = selected.sort((a: any, b: any) => {
      const tsA = a.node?.metadata?.timestamp || 0;
      const tsB = b.node?.metadata?.timestamp || 0;
      return tsA - tsB;
    });

    return sorted.map((n: any) => {
      const text = n.node?.text || n.node?.getContent?.() || '';
      const score = (n.score || 0).toFixed(4);
      this.logger.log(`[retrieveRelevantHistory] score=${score}, text=${text.substring(0, 80)}...`);
      return text;
    });
  }

  /**
   * 删除指定 session 的所有向量化记忆
   */
  async deleteSessionMemory(agentId: string, sessionId: string): Promise<void> {
    try {
      const collection = this.getCollectionName(agentId);
      const result = await this.prisma.$executeRawUnsafe(
        `DELETE FROM public.llamaindex_embedding WHERE collection = $1 AND metadata->>'session_id' = $2 AND metadata->>'type' = 'chat_memory'`,
        collection,
        sessionId,
      );
      this.logger.log(
        `[deleteSessionMemory] 删除 session=${sessionId} 的 ${result} 条向量记忆`,
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
      for (let i = 0; i < fullHistory.length - 1; i++) {
        if (fullHistory[i].role === 'user' && fullHistory[i + 1].role === 'assistant') {
          pairs.push({
            index: Math.floor(i / 2),
            user: fullHistory[i].content,
            assistant: fullHistory[i + 1].content,
          });
        }
      }

      this.logger.log(`[vectorizeOlderPairs] 提取到 ${pairs.length} 个 Q&A 对`);

      // 所有 Q&A 对都向量化，检索时再排除当前 session 最近的
      if (pairs.length === 0) {
        this.logger.log(`[vectorizeOlderPairs] 无 Q&A 对，跳过向量化`);
        return;
      }
      const allPairs = pairs;

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
      const newPairs = allPairs.filter(
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
