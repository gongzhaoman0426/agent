import { truncateToolResult } from './tool-result.js';

/** Mastra Memory 召回的原始消息 */
export interface RecalledMessage {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: Date | string;
}

export interface ToolCallInfo {
  toolId: string;
  toolName: string;
  toolKwargs?: Record<string, unknown>;
  result?: unknown;
  done: boolean;
}

/** 与流式 SSE 协议对齐的消息分片，前端按序渲染 */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ToolCallInfo };

/** 前端渲染用的消息 */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  createdAt?: Date | string;
}

interface StoredToolInvocation {
  state?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

/**
 * 单个存储分片 → 渲染分片。
 * reasoning / step-start 等内部分片不展示，返回 null。
 */
function toPart(raw: unknown): MessagePart | null {
  const part = asRecord(raw);
  if (!part) {
    return null;
  }

  if (part.type === 'text') {
    const text = String(part.text ?? '');
    return text ? { type: 'text', text } : null;
  }

  if (part.type === 'tool-invocation') {
    const invocation = (asRecord(part.toolInvocation) ??
      {}) as StoredToolInvocation;
    return {
      type: 'tool_call',
      toolCall: {
        toolId: String(invocation.toolCallId ?? ''),
        toolName: String(invocation.toolName ?? ''),
        toolKwargs: invocation.args ?? {},
        result: truncateToolResult(invocation.result),
        done: invocation.state === 'result',
      },
    };
  }

  return null;
}

/**
 * Memory 里消息体有多种形态（字符串 / parts 数组 / { parts } 对象），
 * 统一成文本 + 分片：文本用于用户气泡与兜底渲染，分片让工具调用在
 * 刷新后依然可见。没有任何可渲染内容时返回 null 由调用方过滤。
 */
export function toUiMessage(message: RecalledMessage): UiMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return null;
  }

  let rawParts: unknown[] = [];
  let content = '';

  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    rawParts = message.content;
  } else {
    const record = asRecord(message.content);
    if (record && Array.isArray(record.parts)) {
      rawParts = record.parts;
    } else if (record && typeof record.content === 'string') {
      content = record.content;
    }
  }

  const parts = rawParts
    .map(toPart)
    .filter((part): part is MessagePart => part !== null);

  if (!content) {
    content = parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
  }

  if (!content && parts.length === 0) {
    return null;
  }

  return {
    id: String(message.id ?? ''),
    role: message.role,
    content,
    ...(parts.length > 0 && { parts }),
    createdAt: message.createdAt,
  };
}
