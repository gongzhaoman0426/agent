import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlamaindexService } from '../llamaindex/llamaindex.service';

interface ChatMessageItem {
  role: 'user' | 'assistant';
  content: string;
}

interface MemoryResult {
  enhancedPrompt: string;
  recentHistory: ChatMessageItem[];
}

/** 未压缩消息 token 超过此值触发压缩 */
const TOKEN_COMPACTION_THRESHOLD = 4000;
/** 压缩后目标保留的 token 数 */
const TOKEN_COMPACTION_TARGET = 2000;
/** 摘要总 token 超过此值触发合并 */
const MAX_SUMMARY_TOKENS = 2000;
/** 压缩后至少保留的轮次数 */
const MIN_KEEP_TURNS = 5;

// ─── Token 估算工具 ───

// js-tiktoken 是 ESM 模块，需要动态导入
let _encoder: any = null;
let _getEncoding: any = null;

async function ensureEncoder(): Promise<void> {
  if (!_encoder) {
    if (!_getEncoding) {
      const mod = await import('js-tiktoken');
      _getEncoding = mod.getEncoding;
    }
    _encoder = _getEncoding('cl100k_base');
  }
}

/** 估算单段文本的 token 数（基于 cl100k_base，与 Claude tokenizer 误差 ~5-10%） */
async function estimateTokens(text: string): Promise<number> {
  await ensureEncoder();
  return _encoder.encode(text).length;
}

/** 估算消息数组的总 token 数 */
async function estimateMessagesTokens(messages: ChatMessageItem[]): Promise<number> {
  await ensureEncoder();
  return messages.reduce((sum, m) => sum + _encoder.encode(m.content).length, 0);
}

@Injectable()
export class ChatMemoryService {
  private readonly logger = new Logger('ChatMemory');

  constructor(
    private readonly prisma: PrismaService,
    private readonly llamaIndexService: LlamaindexService,
  ) {}

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

  /**
   * 计算需要压缩的轮次数：从最老消息开始累加 token，直到剩余可压缩 token <= target
   * 入参 compressibleMessages 已排除最近 MIN_KEEP_TURNS 轮，compressibleTokens 是其总 token
   */
  private async calculateTurnsToCompress(
    compressibleMessages: ChatMessageItem[],
    compressibleTokens: number,
    targetTokens: number,
  ): Promise<number> {
    let accumulated = 0;
    let turns = 0;
    const totalTurns = Math.floor(compressibleMessages.length / 2);

    for (let i = 0; i < totalTurns; i++) {
      const userMsg = compressibleMessages[i * 2];
      const assistantMsg = compressibleMessages[i * 2 + 1];
      if (!userMsg || !assistantMsg) break;
      accumulated += await estimateTokens(userMsg.content) + await estimateTokens(assistantMsg.content);
      turns++;

      if (compressibleTokens - accumulated <= targetTokens) {
        break;
      }
    }

    return Math.max(turns, 1);
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

    // 3. 提取未摘要的消息，分为可压缩部分和保留部分（最近 MIN_KEEP_TURNS 轮）
    const unsummarizedMessages = fullHistory.slice(summarizedTurnCount * 2);
    const unsummarizedTurns = Math.floor(unsummarizedMessages.length / 2);

    // 可压缩部分 = 排除最近 MIN_KEEP_TURNS 轮之后的消息
    const compressibleCount = Math.max(unsummarizedTurns - MIN_KEEP_TURNS, 0);
    const compressibleMessages = unsummarizedMessages.slice(0, compressibleCount * 2);
    const keptMessages = unsummarizedMessages.slice(compressibleCount * 2);
    const compressibleTokens = await estimateMessagesTokens(compressibleMessages);
    this.logger.log(`[processMemory] 已摘要轮次=${summarizedTurnCount}, 未摘要轮次=${unsummarizedTurns}, 可压缩轮次=${compressibleCount}, 可压缩tokens=${compressibleTokens}, 摘要条数=${summaries.length}`);

    let recentHistory: ChatMessageItem[];

    // 4. 基于 token 数量的对话压缩（可压缩部分 token 超过阈值时触发）
    if (compressibleTokens >= TOKEN_COMPACTION_THRESHOLD && compressibleCount > 0) {
      const turnsToCompress = await this.calculateTurnsToCompress(
        compressibleMessages,
        compressibleTokens,
        TOKEN_COMPACTION_TARGET,
      );
      const messagesToSummarize = compressibleMessages.slice(0, turnsToCompress * 2);
      const remainingCompressible = compressibleMessages.slice(turnsToCompress * 2);

      try {
        const summaryText = await this.summarizeTurns(messagesToSummarize);
        await this.prisma.sessionSummary.create({
          data: {
            sessionId,
            agentId,
            content: summaryText,
            turnStart: summarizedTurnCount,
            turnEnd: summarizedTurnCount + turnsToCompress - 1,
          },
        });
        const compressedTokens = compressibleTokens - await estimateMessagesTokens(remainingCompressible);
        this.logger.log(`[processMemory] 压缩完成: 轮次 ${summarizedTurnCount}-${summarizedTurnCount + turnsToCompress - 1} (${turnsToCompress} 轮, ~${compressedTokens} tokens) → 1 条摘要`);
        recentHistory = [...remainingCompressible, ...keptMessages];

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

    // 5. 基于 token 数量的摘要合并（摘要总 token 超过阈值时，最老 3 条 → 1 条）
    let totalSummaryTokens = 0;
    for (const s of summaries) {
      totalSummaryTokens += await estimateTokens(s.content);
    }
    if (totalSummaryTokens > MAX_SUMMARY_TOKENS && summaries.length >= 3) {
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
        this.logger.log(`[processMemory] 摘要合并: ${oldest3.length} 条 → 1 条 (轮次 ${oldest3[0].turnStart}-${oldest3[2].turnEnd}, ${totalSummaryTokens} tokens → ~${await estimateTokens(mergedText)} tokens)`);

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

    // 强制 LLM 在涉及数据查询/操作时调用工具，而非凭记忆回答
    contextParts.push(
      '\n\n## 工具使用规则\n' +
      '当用户询问或操作以下内容时，你必须调用对应的工具获取实时数据，严禁从对话历史或记忆中直接回答：\n' +
      '- 定时任务（查询、创建、修改、删除）→ 必须调用 listScheduledTasks / createScheduledTask / updateScheduledTask / deleteScheduledTask\n' +
      '- 任何需要查询实时状态的请求 → 必须调用工具\n' +
      '如果用户要求删除所有定时任务，你必须先调用 listScheduledTasks 获取列表，再调用 deleteScheduledTask 删除。',
    );

    const enhancedPrompt = contextParts.join('');
    const promptTokens = await estimateTokens(systemPrompt);
    const enhancedTokens = await estimateTokens(enhancedPrompt);
    const recentTokens = await estimateMessagesTokens(recentHistory);
    this.logger.log(`[processMemory] prompt: 原始=${systemPrompt.length}字/${promptTokens}tokens, 增强后=${enhancedPrompt.length}字/${enhancedTokens}tokens, recentHistory=${recentHistory.length}条/${recentTokens}tokens`);

    return { enhancedPrompt, recentHistory };
  }
}
