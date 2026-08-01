import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Bell, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  useAckScheduleInbox,
  useScheduleInbox,
} from '@/services/queries';
import type { ScheduledTask } from '@/types';
import { Button } from '@/ui/button';

function useActiveChatSessionId(): string | undefined {
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  return typeof search.session === 'string' ? search.session : undefined;
}

/**
 * Web 渠道：对话已写入「创建任务时的 session」。
 * - 若用户正打开该会话：由 useScheduleSessionSync 刷消息，此处不弹窗
 * - 若在别处：轻提示并可跳回原会话
 */
export function ScheduleInboxToaster() {
  const { data: inbox } = useScheduleInbox();
  const ack = useAckScheduleInbox();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeSessionId = useActiveChatSessionId();
  const [current, setCurrent] = useState<ScheduledTask | null>(null);

  const remoteInbox = useMemo(
    () =>
      (inbox ?? []).filter(
        (item) => !activeSessionId || item.sessionId !== activeSessionId,
      ),
    [activeSessionId, inbox],
  );

  useEffect(() => {
    if (!remoteInbox.length) {
      setCurrent(null);
      return;
    }
    setCurrent((prev) => {
      if (prev && remoteInbox.some((item) => item.id === prev.id)) {
        return prev;
      }
      return remoteInbox[0] ?? null;
    });
  }, [remoteInbox]);

  // 正打开的会话：只刷缓存，交给 session sync 拉消息
  useEffect(() => {
    if (!activeSessionId || !inbox?.length) return;
    const localHits = inbox.filter((item) => item.sessionId === activeSessionId);
    if (localHits.length === 0) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.session(activeSessionId),
    });
  }, [activeSessionId, inbox, queryClient]);

  if (!current) return null;

  const dismiss = () => {
    const id = current.id;
    setCurrent(null);
    ack.mutate([id], {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.session(current.sessionId),
        });
      },
    });
  };

  const openSession = () => {
    const { sessionId, agentId, id } = current;
    setCurrent(null);
    ack.mutate([id], {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.session(sessionId),
        });
      },
    });
    void navigate({
      to: '/chat',
      search: { session: sessionId, agent: agentId },
    });
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">定时回复已写入原会话</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              触发：「{current.message}」
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={openSession}>
                打开会话
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                稍后
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-faint hover:bg-muted hover:text-foreground"
            aria-label="关闭"
            onClick={dismiss}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
