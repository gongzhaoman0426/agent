import { useRef, useState } from 'react';
import type { StreamCallbacks } from '@/lib/api';
import { generateUUID } from '@/lib/utils';
import type { MessagePart, UiMessage } from '@/types';

type StreamStarter = (
  callbacks: StreamCallbacks,
  signal: AbortSignal,
) => Promise<void>;

type DoneData = Parameters<StreamCallbacks['onDone']>[0];

/**
 * 流式对话的消息累积与状态机：把 SSE 分片合并成消息 parts，
 * 维护 streaming/thinking 标志与中止控制。具体调哪个接口由调用方给出。
 */
export function useStreamMessages() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const appendAssistantPart = (part: MessagePart) => {
    setThinking(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== 'assistant' || !last.parts) {
        next.push({
          id: generateUUID(),
          role: 'assistant',
          content: '',
          parts: [part],
        });
        return next;
      }
      const parts = [...last.parts];
      const lastPart = parts[parts.length - 1];
      // 连续文本分片合并成一段，避免渲染出无数个片段
      if (part.type === 'text' && lastPart?.type === 'text') {
        parts[parts.length - 1] = {
          type: 'text',
          text: lastPart.text + part.text,
        };
      } else {
        parts.push(part);
      }
      next[next.length - 1] = { ...last, parts };
      return next;
    });
  };

  const markToolDone = (toolId: string, result: unknown) => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.role !== 'assistant' || !message.parts) return message;
        return {
          ...message,
          parts: message.parts.map((part) =>
            part.type === 'tool_call' && part.toolCall.toolId === toolId
              ? { ...part, toolCall: { ...part.toolCall, result, done: true } }
              : part,
          ),
        };
      }),
    );
  };

  const send = async (
    message: string,
    start: StreamStarter,
    onDone?: (data: DoneData) => void,
  ) => {
    setStreaming(true);
    setThinking(true);
    setMessages((prev) => [
      ...prev,
      { id: generateUUID(), role: 'user', content: message },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await start(
        {
          onDelta: (delta) => appendAssistantPart({ type: 'text', text: delta }),
          onToolCall: (data) =>
            appendAssistantPart({
              type: 'tool_call',
              toolCall: { ...data, done: false },
            }),
          onToolResult: (data) => markToolDone(data.toolId, data.result),
          onDone: (data) => {
            // 后端可能还在补发收尾事件，但对话已完成，立刻解除输入锁定
            setStreaming(false);
            setThinking(false);
            onDone?.(data);
          },
          onError: (errorMessage) =>
            appendAssistantPart({
              type: 'text',
              text: `\n[错误] ${errorMessage}`,
            }),
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        appendAssistantPart({
          type: 'text',
          text: `\n[错误] ${(error as Error).message}`,
        });
      }
    } finally {
      // 收尾事件会让流比对话本身晚结束，期间用户可能已发起新一轮
      if (abortRef.current === controller) {
        setStreaming(false);
        setThinking(false);
        abortRef.current = null;
      }
    }
  };

  const abort = () => abortRef.current?.abort();

  const clear = () => {
    abort();
    setMessages([]);
  };

  return {
    messages,
    setMessages,
    streaming,
    thinking,
    send,
    abort,
    clear,
  };
}
