/** Mastra Memory 召回的原始消息 */
export interface RecalledMessage {
  id?: string;
  role: string;
  content: unknown;
  createdAt?: Date | string;
}

/** 前端渲染用的消息 */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date | string;
}

const textOf = (part: unknown): string =>
  typeof part === 'object' && part !== null && 'text' in part
    ? String((part as { text: unknown }).text ?? '')
    : '';

/**
 * Memory 里消息体有多种形态（字符串 / parts 数组 / { parts } 对象），
 * 统一抽成纯文本；工具调用等非文本消息返回 null 由调用方过滤。
 */
export function toUiMessage(message: RecalledMessage): UiMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return null;
  }

  let content = '';
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    content = message.content.map(textOf).join('');
  } else if (typeof message.content === 'object' && message.content !== null) {
    const record = message.content as Record<string, unknown>;
    if (Array.isArray(record.parts)) {
      content = record.parts.map(textOf).join('');
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
