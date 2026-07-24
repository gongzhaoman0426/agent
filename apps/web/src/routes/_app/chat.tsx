import { useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Square } from 'lucide-react';
import { streamChat } from '@/lib/api';
import { generateUUID } from '@/lib/utils';
import {
  queryKeys,
  useAgents,
  useSessionDetail,
} from '@/services/queries';
import type { MessagePart, UiMessage } from '@/types';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/input';
import { MessageView, ThinkingIndicator } from '@/components/chat/message-view';

interface ChatSearch {
  session?: string;
  agent?: string;
}

export const Route = createFileRoute('/_app/chat')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    session: typeof search.session === 'string' ? search.session : undefined,
    agent: typeof search.agent === 'string' ? search.agent : undefined,
  }),
  component: ChatPage,
});

const LAST_AGENT_KEY = 'agent-next:last-agent';

function ChatPage() {
  const { session: sessionParam, agent: agentParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const { data: agents } = useAgents();
  const [agentId, setAgentId] = useState<string>(
    () => agentParam || localStorage.getItem(LAST_AGENT_KEY) || '',
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);

  /** 本组件内发起的会话，避免 URL 变化后重复加载历史覆盖流式内容 */
  const localSessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isLocalSession = sessionParam
    ? localSessionRef.current === sessionParam
    : true;
  const { data: sessionDetail } = useSessionDetail(
    sessionParam && !isLocalSession ? sessionParam : null,
  );

  // 打开历史会话：加载消息、锁定 Agent
  useEffect(() => {
    if (sessionDetail) {
      setMessages(
        sessionDetail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
      if (sessionDetail.agentId) {
        setAgentId(sessionDetail.agentId);
      }
    }
  }, [sessionDetail]);

  // 新对话：清空
  useEffect(() => {
    if (!sessionParam) {
      setMessages([]);
      localSessionRef.current = null;
    }
  }, [sessionParam]);

  useEffect(() => {
    if (agentParam) {
      setAgentId(agentParam);
    }
  }, [agentParam]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

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
              ? {
                  ...part,
                  toolCall: { ...part.toolCall, result, done: true },
                }
              : part,
          ),
        };
      }),
    );
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || streaming || !agentId) return;

    localStorage.setItem(LAST_AGENT_KEY, agentId);

    const sessionId = sessionParam ?? generateUUID();
    localSessionRef.current = sessionId;

    if (!sessionParam) {
      navigate({
        search: { session: sessionId, agent: agentId },
        replace: true,
      });
    }

    setInput('');
    setStreaming(true);
    setThinking(true);
    setMessages((prev) => [
      ...prev,
      { id: generateUUID(), role: 'user', content: message },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        agentId,
        { message, sessionId },
        {
          onDelta: (delta) => appendAssistantPart({ type: 'text', text: delta }),
          onToolCall: (data) =>
            appendAssistantPart({
              type: 'tool_call',
              toolCall: { ...data, done: false },
            }),
          onToolResult: (data) => markToolDone(data.toolId, data.result),
          onDone: () => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.sessions,
            });
          },
          onError: (errorMessage) => {
            appendAssistantPart({
              type: 'text',
              text: `\n[错误] ${errorMessage}`,
            });
          },
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
      setStreaming(false);
      setThinking(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const agentLocked = Boolean(sessionParam && messages.length > 0);
  const currentAgent = agents?.find((agent) => agent.id === agentId);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-6 py-3">
        <select
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm focus:outline-none"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={agentLocked}
        >
          <option value="">选择智能体...</option>
          {(agents ?? []).map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        {currentAgent?.description && (
          <span className="truncate text-sm text-muted-foreground">
            {currentAgent.description}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && !thinking && (
            <div className="pt-24 text-center text-muted-foreground">
              <p className="text-lg font-medium">开始新对话</p>
              <p className="mt-1 text-sm">
                {agentId ? '输入消息开始与智能体对话' : '请先在上方选择一个智能体'}
              </p>
            </div>
          )}
          {messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
          {thinking && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            className="max-h-40 min-h-[44px] flex-1 resize-none"
            placeholder={agentId ? '输入消息，Enter 发送，Shift+Enter 换行' : '请先选择智能体'}
            value={input}
            disabled={!agentId}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
          />
          {streaming ? (
            <Button variant="outline" size="icon" onClick={handleStop} title="停止">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => void handleSend()}
              disabled={!input.trim() || !agentId}
              title="发送"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
