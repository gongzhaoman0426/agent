import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { MastraDBMessage } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { Agent, AgentSkill, AgentToolkit, AgentWorkflow } from '@prisma/client';
import {
  toUiMessage,
  type RecalledMessage,
  type UiMessage,
} from '../common/memory-message.js';
import { mapStreamChunk, type SseChunk } from '../common/sse.js';
import { MastraService } from '../mastra/mastra.service.js';
import { ToolkitService } from '../toolkit/toolkit.service.js';
import { REQUEST_CONTEXT_KEYS } from '../toolkit/toolkit.types.js';
import { WECHAT_CHANNEL_SYSTEM_PROMPT } from '../common/channel-prompts.js';
import { AgentRegistryService } from './agent-registry.service.js';
import type { ChatDto } from './agent.types.js';

type AgentWithMounts = Agent & {
  agentToolkits: AgentToolkit[];
  agentWorkflows: AgentWorkflow[];
  agentSkills: AgentSkill[];
};

const TITLE_WAIT_TIMEOUT_MS = 20_000;
const TITLE_POLL_INTERVAL_MS = 600;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly registry: AgentRegistryService,
    private readonly toolkitService: ToolkitService,
  ) {}

  /** SSE 流式对话：Mastra fullStream → 前端事件协议 */
  async *chatStream(
    agent: AgentWithMounts,
    dto: ChatDto,
    userId: string,
  ): AsyncGenerator<SseChunk> {
    const { threadId, resourceId, hasTitle } = await this.ensureThread(
      dto.sessionId,
      userId,
      agent,
    );

    const instance = await this.registry.getInstance(agent);
    const requestContext = await this.buildRequestContext(
      userId,
      agent.id,
      threadId,
      dto.channel,
    );

    const stream = await instance.stream(dto.message, {
      memory: { thread: threadId, resource: resourceId },
      requestContext,
      ...(dto.channel === 'wechat'
        ? { system: WECHAT_CHANNEL_SYSTEM_PROMPT }
        : {}),
    });

    let responseText = '';
    for await (const chunk of stream.fullStream) {
      const mapped = mapStreamChunk(chunk, this.logger);
      if (mapped) {
        if (mapped.event === 'delta') {
          responseText += String(mapped.data.delta ?? '');
        }
        yield mapped;
      }
    }

    /*
     * 内容流结束即宣告完成：Mastra 的收尾（消息落库、向量化、标题生成）在
     * 内部异步进行，`await stream.text` 会一直等到它们全部完成（实测 10s+），
     * 阻塞 done 只会让用户看完回复还不能继续输入。
     */
    yield {
      event: 'done',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        sessionId: threadId,
        response: responseText,
      },
    };

    // 新会话的标题是异步生成的，落库后补发一个事件让前端刷新会话列表
    if (!hasTitle && responseText) {
      const title = await this.waitForTitle(stream, threadId);
      if (title) {
        yield { event: 'title', data: { sessionId: threadId, title } };
      }
    }
  }

  /**
   * 非流式对话（API / 定时任务触发）。
   * @param options.hideUserMessage 为 true 时：仍用会话历史作上下文，但不落库用户消息，
   *   只把本轮 Assistant 回复写入 session（定时任务到期指令不应出现在会话里）。
   */
  async chat(
    agent: AgentWithMounts,
    dto: ChatDto,
    userId: string,
    options?: {
      threadTitle?: string;
      hideUserMessage?: boolean;
      channelMeta?: Record<string, unknown>;
    },
  ) {
    const { threadId, resourceId } = await this.ensureThread(
      dto.sessionId,
      userId,
      agent,
      options?.threadTitle,
    );

    const instance = await this.registry.getInstance(agent);
    const requestContext = await this.buildRequestContext(
      userId,
      agent.id,
      threadId,
      dto.channel,
      options?.channelMeta,
    );

    const hideUserMessage = options?.hideUserMessage === true;
    const result = await instance.generate(dto.message, {
      memory: {
        thread: threadId,
        resource: resourceId,
        ...(hideUserMessage ? { options: { readOnly: true } } : {}),
      },
      requestContext,
      ...(dto.channel === 'wechat'
        ? { system: WECHAT_CHANNEL_SYSTEM_PROMPT }
        : {}),
    });

    if (hideUserMessage) {
      await this.persistAssistantOnly(result, threadId, resourceId);
    }

    const mediaDelivered = Boolean(
      requestContext.get(REQUEST_CONTEXT_KEYS.wechatMediaDelivered),
    );

    return {
      agentId: agent.id,
      agentName: agent.name,
      sessionId: threadId,
      userMessage: dto.message,
      // 多 step（tool call）时 text 会拼上中间话术；渠道回传只要最后一步
      // 微信语音/图片已送达时抑制文本，避免双发
      response: mediaDelivered ? '' : extractFinalAssistantText(result),
      skipTextReply: mediaDelivered,
      timestamp: new Date().toISOString(),
    };
  }

  /** 定时任务等场景：只把本轮 assistant 消息写入线程 */
  private async persistAssistantOnly(
    result: {
      text: string;
      messages?: MastraDBMessage[];
      rememberedMessages?: MastraDBMessage[];
    },
    threadId: string,
    resourceId: string,
  ) {
    const rememberedIds = new Set(
      (result.rememberedMessages ?? []).map((message) => message.id),
    );
    const fromResult = (result.messages ?? [])
      .filter(
        (message) =>
          message.role === 'assistant' && !rememberedIds.has(message.id),
      )
      .map(
        (message): MastraDBMessage => ({
          ...message,
          threadId,
          resourceId,
          createdAt: message.createdAt ?? new Date(),
        }),
      );

    if (fromResult.length > 0) {
      await this.mastraService.memory.saveMessages({ messages: fromResult });
      return;
    }

    const text = result.text?.trim();
    if (!text) return;

    const fallback: MastraDBMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: new Date(),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [{ type: 'text', text }],
      },
    };
    await this.mastraService.memory.saveMessages({ messages: [fallback] });
  }

  /**
   * 只把用户侧上下文写入会话（不触发模型）。
   * 用于群聊未 @ 的旁路消息：先积累上下文，等被 @ 时 generate 可读到近期群聊。
   */
  async appendUserMessage(
    agent: AgentWithMounts,
    input: {
      sessionId: string;
      userId: string;
      text: string;
      threadTitle?: string;
    },
  ): Promise<void> {
    const text = input.text.trim();
    if (!text) return;

    const { threadId, resourceId } = await this.ensureThread(
      input.sessionId,
      input.userId,
      agent,
      input.threadTitle,
    );

    const message: MastraDBMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      createdAt: new Date(),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [{ type: 'text', text }],
      },
    };
    await this.mastraService.memory.saveMessages({ messages: [message] });
  }

  /**
   * 只把助手侧消息写入会话（不触发模型）。
   * 用于运营台人工回复落库，与用户侧微信消息同线程。
   */
  async appendAssistantMessage(
    agent: AgentWithMounts,
    input: {
      sessionId: string;
      userId: string;
      text: string;
      threadTitle?: string;
    },
  ): Promise<void> {
    const text = input.text.trim();
    if (!text) return;

    const { threadId, resourceId } = await this.ensureThread(
      input.sessionId,
      input.userId,
      agent,
      input.threadTitle,
    );

    const message: MastraDBMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: new Date(),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [{ type: 'text', text }],
      },
    };
    await this.mastraService.memory.saveMessages({ messages: [message] });
  }

  // ============ 会话管理（Mastra Memory 存储） ============

  /**
   * Web 试聊会话列表（排除微信渠道 wechat:…，避免与运营收件箱混在一起）。
   */
  async listAllSessions(userId: string) {
    const result = await this.mastraService.memory.listThreads({
      filter: { metadata: { userId } },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      perPage: 100,
    });

    return result.threads
      .filter((thread) => !String(thread.id).startsWith('wechat:'))
      .map((thread) => this.toSessionSummary(thread));
  }

  /** 列出某微信账号下的会话线程（含群），供运营收件箱使用 */
  async listWechatSessions(userId: string, accountId: string, limit = 80) {
    const result = await this.mastraService.memory.listThreads({
      filter: { metadata: { userId } },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      perPage: Math.min(200, Math.max(limit * 2, 50)),
    });

    const prefix = `wechat:`;
    const out: Array<{
      id: string;
      title: string;
      agentId: string;
      agentName: string;
      createdAt?: Date | string;
      updatedAt?: Date | string;
      accountId: string;
      peerWxid: string;
      isGroup: boolean;
    }> = [];

    for (const thread of result.threads) {
      const id = String(thread.id);
      if (!id.startsWith(prefix)) continue;
      const m = id.match(/^wechat:([^:]+):([^:]+):(.+)$/);
      if (!m) continue;
      if (m[2] !== accountId) continue;
      const peerWxid = m[3];
      out.push({
        ...this.toSessionSummary(thread),
        accountId: m[2],
        peerWxid,
        isGroup: peerWxid.includes('@chatroom'),
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const thread = await this.requireOwnedThread(sessionId, userId);
    const recalled = await this.mastraService.memory.recall({
      threadId: sessionId,
    });

    const messages = (recalled?.messages ?? [])
      .map((message) => toUiMessage(message as RecalledMessage))
      .filter((message): message is UiMessage => message !== null);

    return {
      ...this.toSessionSummary(thread),
      messages,
    };
  }

  async deleteSession(sessionId: string, userId: string) {
    await this.requireOwnedThread(sessionId, userId);
    await this.mastraService.memory.deleteThread(sessionId);
    return { success: true };
  }

  // ============ 内部方法 ============

  private async ensureThread(
    sessionId: string,
    userId: string,
    agent: AgentWithMounts,
    threadTitle?: string,
  ) {
    const resourceId = `${userId}:${agent.id}`;
    const existing = await this.mastraService.memory
      .getThreadById({ threadId: sessionId })
      .catch(() => null);

    if (existing) {
      const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
      if (metadata.userId !== userId) {
        throw new ForbiddenException('无权访问该会话');
      }
      return { threadId: sessionId, resourceId, hasTitle: Boolean(existing.title) };
    }

    await this.mastraService.memory.createThread({
      threadId: sessionId,
      resourceId,
      title: threadTitle,
      metadata: { userId, agentId: agent.id, agentName: agent.name },
    });
    return { threadId: sessionId, resourceId, hasTitle: Boolean(threadTitle) };
  }

  private async requireOwnedThread(sessionId: string, userId: string) {
    const thread = await this.mastraService.memory
      .getThreadById({ threadId: sessionId })
      .catch(() => null);
    if (!thread) {
      throw new NotFoundException('会话不存在');
    }
    const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
    if (metadata.userId !== userId) {
      throw new ForbiddenException('无权访问该会话');
    }
    return thread;
  }

  private async buildRequestContext(
    userId: string,
    agentId: string,
    sessionId: string,
    channel: string = 'web',
    channelMeta?: Record<string, unknown>,
  ) {
    const requestContext = new RequestContext();
    requestContext.set(REQUEST_CONTEXT_KEYS.userId, userId);
    requestContext.set(REQUEST_CONTEXT_KEYS.agentId, agentId);
    requestContext.set(REQUEST_CONTEXT_KEYS.sessionId, sessionId);
    requestContext.set(REQUEST_CONTEXT_KEYS.channel, channel);
    if (channelMeta && Object.keys(channelMeta).length > 0) {
      requestContext.set(REQUEST_CONTEXT_KEYS.channelMeta, channelMeta);
    }
    requestContext.set(
      REQUEST_CONTEXT_KEYS.toolkitSettings,
      await this.toolkitService.getSettingsMap(userId),
    );
    return requestContext;
  }

  private async getThreadTitle(threadId: string): Promise<string | null> {
    const thread = await this.mastraService.memory
      .getThreadById({ threadId })
      .catch(() => null);
    return thread?.title ?? null;
  }

  /**
   * 标题由 Mastra 在收尾阶段异步生成，落库时间不确定，
   * 这里轮询等待一小段时间；超时放弃（前端下次拉取会话列表自会拿到）。
   */
  private async waitForTitle(
    stream: { text: Promise<string> },
    threadId: string,
  ): Promise<string | null> {
    await stream.text.catch(() => undefined);

    const deadline = Date.now() + TITLE_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const title = await this.getThreadTitle(threadId);
      if (title) {
        return title;
      }
      await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_INTERVAL_MS));
    }
    return null;
  }

  private toSessionSummary(thread: ThreadLike) {
    const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
    return {
      id: thread.id,
      title: thread.title || '新对话',
      agentId: String(metadata.agentId ?? ''),
      agentName: String(metadata.agentName ?? ''),
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

}

/**
 * 多轮 tool-call 时 Mastra 的 `text` 会拼接各 step 文本。
 * 渠道回传（微信等）只取最后一个非空 step 的文本作为最终回复。
 */
function extractFinalAssistantText(result: {
  text?: string;
  steps?: Array<{ text?: string }>;
}): string {
  const steps = result.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const stepText = steps[i]?.text?.trim();
    if (stepText) {
      return stepText;
    }
  }
  return result.text?.trim() ?? '';
}

interface ThreadLike {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}
