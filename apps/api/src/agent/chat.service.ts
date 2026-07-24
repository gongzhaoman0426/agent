import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RequestContext } from '@mastra/core/request-context';
import type { Agent, AgentSkill, AgentToolkit, AgentWorkflow } from '@prisma/client';
import { MastraService } from '../mastra/mastra.service.js';
import { ToolkitService } from '../toolkit/toolkit.service.js';
import { REQUEST_CONTEXT_KEYS } from '../toolkit/toolkit.types.js';
import { AgentRegistryService } from './agent-registry.service.js';
import type { ChatDto } from './agent.types.js';

type AgentWithMounts = Agent & {
  agentToolkits: AgentToolkit[];
  agentWorkflows: AgentWorkflow[];
  agentSkills: AgentSkill[];
};

export interface SseChunk {
  event: 'delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: Record<string, unknown>;
}

const TOOL_RESULT_MAX_LENGTH = 1000;

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
    const { threadId, resourceId } = await this.ensureThread(
      dto.sessionId,
      userId,
      agent,
    );

    const instance = this.registry.getInstance(agent);
    const requestContext = await this.buildRequestContext(
      userId,
      agent.id,
      threadId,
    );

    const stream = await instance.stream(dto.message, {
      memory: { thread: threadId, resource: resourceId },
      requestContext,
    });

    for await (const chunk of stream.fullStream) {
      const mapped = this.mapChunk(chunk as unknown as StreamChunk);
      if (mapped) {
        yield mapped;
      }
    }

    const responseText = await stream.text;
    const title = await this.getThreadTitle(threadId);

    yield {
      event: 'done',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        sessionId: threadId,
        response: responseText,
        ...(title ? { title } : {}),
      },
    };
  }

  /** 非流式对话（API 场景） */
  async chat(agent: AgentWithMounts, dto: ChatDto, userId: string) {
    const { threadId, resourceId } = await this.ensureThread(
      dto.sessionId,
      userId,
      agent,
    );

    const instance = this.registry.getInstance(agent);
    const requestContext = await this.buildRequestContext(
      userId,
      agent.id,
      threadId,
    );

    const result = await instance.generate(dto.message, {
      memory: { thread: threadId, resource: resourceId },
      requestContext,
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      sessionId: threadId,
      userMessage: dto.message,
      response: result.text,
      timestamp: new Date().toISOString(),
    };
  }

  // ============ 会话管理（Mastra Memory 存储） ============

  async listAllSessions(userId: string) {
    const result = await this.mastraService.memory.listThreads({
      filter: { metadata: { userId } },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      perPage: 100,
    });

    return result.threads.map((thread) => this.toSessionSummary(thread));
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const thread = await this.requireOwnedThread(sessionId, userId);
    const recalled = await this.mastraService.memory.recall({
      threadId: sessionId,
    });

    const messages = (recalled?.messages ?? [])
      .map((message) => this.toUiMessage(message as RecalledMessage))
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
      return { threadId: sessionId, resourceId };
    }

    await this.mastraService.memory.createThread({
      threadId: sessionId,
      resourceId,
      metadata: { userId, agentId: agent.id, agentName: agent.name },
    });
    return { threadId: sessionId, resourceId };
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
  ) {
    const requestContext = new RequestContext();
    requestContext.set(REQUEST_CONTEXT_KEYS.userId, userId);
    requestContext.set(REQUEST_CONTEXT_KEYS.agentId, agentId);
    requestContext.set(REQUEST_CONTEXT_KEYS.sessionId, sessionId);
    requestContext.set(
      REQUEST_CONTEXT_KEYS.toolkitSettings,
      await this.toolkitService.getSettingsMap(userId),
    );
    return requestContext;
  }

  private mapChunk(chunk: StreamChunk): SseChunk | null {
    const payload = (chunk.payload ?? {}) as Record<string, unknown>;

    switch (chunk.type) {
      case 'text-delta': {
        const delta = String(payload.text ?? payload.textDelta ?? '');
        return delta ? { event: 'delta', data: { delta } } : null;
      }
      case 'tool-call':
        return {
          event: 'tool_call',
          data: {
            toolId: String(payload.toolCallId ?? ''),
            toolName: String(payload.toolName ?? ''),
            toolKwargs: payload.args ?? payload.input ?? {},
          },
        };
      case 'tool-result': {
        let result = payload.result ?? payload.output;
        const serialized =
          typeof result === 'string' ? result : JSON.stringify(result ?? null);
        if (serialized.length > TOOL_RESULT_MAX_LENGTH) {
          result = `${serialized.slice(0, TOOL_RESULT_MAX_LENGTH)}...[已截断]`;
        }
        return {
          event: 'tool_result',
          data: {
            toolId: String(payload.toolCallId ?? ''),
            toolName: String(payload.toolName ?? ''),
            result,
          },
        };
      }
      case 'error': {
        this.logger.error(`流式对话错误: ${JSON.stringify(payload)}`);
        return {
          event: 'error',
          data: { message: String(payload.error ?? payload.message ?? '未知错误') },
        };
      }
      default:
        return null;
    }
  }

  private async getThreadTitle(threadId: string): Promise<string | null> {
    const thread = await this.mastraService.memory
      .getThreadById({ threadId })
      .catch(() => null);
    return thread?.title ?? null;
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

  private toUiMessage(message: RecalledMessage): UiMessage | null {
    if (message.role !== 'user' && message.role !== 'assistant') {
      return null;
    }

    let content = '';
    if (typeof message.content === 'string') {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      content = message.content
        .map((part) =>
          typeof part === 'object' && part !== null && 'text' in part
            ? String((part as { text: unknown }).text ?? '')
            : '',
        )
        .join('');
    } else if (
      typeof message.content === 'object' &&
      message.content !== null
    ) {
      const record = message.content as Record<string, unknown>;
      if (Array.isArray(record.parts)) {
        content = record.parts
          .map((part) =>
            typeof part === 'object' && part !== null && 'text' in part
              ? String((part as { text: unknown }).text ?? '')
              : '',
          )
          .join('');
      } else if (typeof record.content === 'string') {
        content = record.content;
      }
    }

    if (!content) {
      return null;
    }

    return {
      id: String(message.id ?? ''),
      role: message.role,
      content,
      createdAt: message.createdAt,
    };
  }
}

interface StreamChunk {
  type: string;
  payload?: unknown;
}

interface ThreadLike {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface RecalledMessage {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: Date | string;
}

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date | string;
}
