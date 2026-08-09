import { useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  MessagesSquare,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import { useScheduleSessionSync } from '@/hooks/use-schedule-session-sync';
import { streamChat } from '@/lib/api';
import { isSubmitEnter } from '@/lib/keyboard';
import { cn, generateUUID } from '@/lib/utils';
import {
  queryKeys,
  useAgents,
  useDeleteSession,
  useSessionDetail,
  useSessions,
} from '@/services/queries';
import type { MessagePart, UiMessage } from '@/types';
import { Button } from '@/ui/button';
import { EntityAvatar } from '@/components/page-shell';
import {
  MessageView,
  ThinkingIndicator,
} from '@/components/chat/message-view';

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

function SessionColumn({
  activeSessionId,
}: {
  activeSessionId?: string;
}) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: sessions } = useSessions();
  const deleteSession = useDeleteSession();

  return (
    <div className="flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-card/60">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="text-[13px] font-semibold">会话</p>
        <Button
          size="iconSm"
          variant="soft"
          title="新对话"
          onClick={() =>
            navigate({ search: { session: undefined, agent: undefined } })
          }
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {(sessions ?? []).length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-faint">
            暂无历史会话
          </p>
        )}
        {(sessions ?? []).map((session) => {
          const active = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              className={cn(
                'group relative flex cursor-pointer items-center rounded-lg px-3 py-2 transition-colors',
                active ? 'bg-primary-soft' : 'hover:bg-muted',
              )}
              onClick={() =>
                navigate({
                  search: { session: session.id, agent: session.agentId },
                })
              }
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-[13px]',
                    active ? 'font-medium text-primary' : 'text-foreground',
                  )}
                  title={session.title}
                >
                  {session.title}
                </p>
                <p className="truncate text-[11px] text-faint">
                  {session.agentName}
                </p>
              </div>
              <button
                className="absolute right-2 hidden rounded-md p-1 text-faint hover:bg-border/60 hover:text-destructive group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession.mutate(session.id);
                  if (active) {
                    navigate({
                      search: { session: undefined, agent: undefined },
                    });
                  }
                }}
                title="删除会话"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      setMessages(sessionDetail.messages);
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

  // 定时任务写回当前会话时，刷入用户句 + Agent 回复
  useScheduleSessionSync(sessionParam, {
    streaming,
    onMessages: setMessages,
  });

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
            // 后端此时仍在补发标题，但对话已完成，立刻解除输入锁定
            setStreaming(false);
            setThinking(false);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.sessions,
            });
          },
          onTitle: () => {
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
      // 标题事件会让流比对话本身晚结束，期间用户可能已发起新一轮
      if (abortRef.current === controller) {
        setStreaming(false);
        setThinking(false);
        abortRef.current = null;
      }
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const agentLocked = Boolean(sessionParam && messages.length > 0);
  const currentAgent = agents?.find((agent) => agent.id === agentId);
  const canSend = Boolean(input.trim() && agentId && !streaming);

  return (
    <div className="flex h-full">
      <SessionColumn activeSessionId={sessionParam} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 头部：智能体选择 */}
        <header className="flex h-[57px] items-center gap-3 border-b border-border bg-card px-6">
          {currentAgent ? (
            <EntityAvatar
              seed={currentAgent.name}
              icon={<Bot className="h-4 w-4" />}
              className="h-8 w-8 rounded-lg"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-faint">
              <Bot className="h-4 w-4" />
            </div>
          )}
          <div className="relative">
            <select
              className="h-9 cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent pl-1 pr-7 text-sm font-semibold transition-colors hover:border-border hover:bg-muted focus:outline-none disabled:cursor-default"
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
            {!agentLocked && (
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            )}
          </div>
          {currentAgent?.description && (
            <span className="truncate text-[13px] text-muted-foreground">
              {currentAgent.description}
            </span>
          )}
        </header>

        {/* 消息区 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && !thinking && (
              <div className="flex flex-col items-center pt-28 text-center animate-rise">
                {currentAgent ? (
                  <>
                    <EntityAvatar
                      seed={currentAgent.name}
                      icon={<Bot className="h-7 w-7" />}
                      className="h-16 w-16 rounded-2xl"
                    />
                    <p className="mt-4 text-lg font-semibold">
                      {currentAgent.name}
                    </p>
                    <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
                      {currentAgent.description || '输入消息开始对话'}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-faint">
                      <MessagesSquare className="h-7 w-7" />
                    </div>
                    <p className="mt-4 text-lg font-semibold">试聊智能体</p>
                    <p className="mt-1 text-sm text-faint">此处看不到微信真实聊天，请用「微信工作台」</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      请先在上方选择一个智能体
                    </p>
                  </>
                )}
              </div>
            )}
            {messages.map((message) => (
              <MessageView key={message.id} message={message} />
            ))}
            {thinking && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入区 */}
        <footer className="px-6 pb-5 pt-1">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_oklch(0.51_0.21_275/0.08)]">
              <textarea
                className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-faint focus:outline-none disabled:opacity-50"
                placeholder={
                  agentId
                    ? '输入消息，Enter 发送，Shift+Enter 换行'
                    : '请先选择智能体'
                }
                value={input}
                disabled={!agentId}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (isSubmitEnter(e)) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
              />
              {streaming ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleStop}
                  title="停止"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="rounded-xl"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  title="发送"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-faint">
              内容由 AI 生成，请注意甄别准确性
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
