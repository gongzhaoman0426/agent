import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  queryKeys,
  useAckScheduleInbox,
  useScheduleInbox,
} from '@/services/queries';
import type { SessionDetail, UiMessage } from '@/types';

/**
 * 当前打开的会话若有定时任务完成：从服务端拉全量消息写回列表并 ack。
 * 对话内容已在创建时的 session 里，这里只是把 UI 刷成最新。
 */
export function useScheduleSessionSync(
  sessionId: string | null | undefined,
  options: {
    enabled?: boolean;
    /** 正在流式输出时不要覆盖本地消息 */
    streaming?: boolean;
    onMessages: (messages: UiMessage[]) => void;
  },
) {
  const { enabled = true, streaming = false, onMessages } = options;
  const { data: inbox } = useScheduleInbox(enabled && Boolean(sessionId));
  const ack = useAckScheduleInbox();
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const onMessagesRef = useRef(onMessages);
  onMessagesRef.current = onMessages;

  useEffect(() => {
    if (!enabled || !sessionId || streaming || syncingRef.current) return;

    const hits = (inbox ?? []).filter((item) => item.sessionId === sessionId);
    if (hits.length === 0) return;

    const taskIds = hits.map((item) => item.id);
    syncingRef.current = true;

    void (async () => {
      try {
        const detail = await api.get<SessionDetail>(
          `/agents/sessions/detail/${sessionId}`,
        );
        onMessagesRef.current(detail.messages);
        queryClient.setQueryData(queryKeys.session(sessionId), detail);
        await ack.mutateAsync(taskIds);
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      } catch {
        // 下次轮询重试
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [ack, enabled, inbox, queryClient, sessionId, streaming]);
}
