import type { RequestContext } from '@mastra/core/request-context';
import {
  REQUEST_CONTEXT_KEYS,
  SCHEDULE_CHANNELS,
  type ScheduleChannel,
} from '../toolkit/toolkit.types.js';

export function requireWorkflowContextString(
  requestContext: RequestContext,
  key: string,
  label: string,
): string {
  const value = requestContext.get(key);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `缺少${label}上下文，无法执行该工作流（请在对话中调用，管理页试跑可能没有会话上下文）`,
    );
  }
  return value.trim();
}

export function readWorkflowChannel(requestContext: RequestContext): {
  channel: ScheduleChannel;
  channelMeta?: Record<string, unknown>;
} {
  const channelRaw = requestContext.get(REQUEST_CONTEXT_KEYS.channel);
  const channel =
    typeof channelRaw === 'string' &&
    (SCHEDULE_CHANNELS as readonly string[]).includes(channelRaw)
      ? (channelRaw as ScheduleChannel)
      : 'web';

  const channelMetaRaw = requestContext.get(REQUEST_CONTEXT_KEYS.channelMeta);
  const channelMeta =
    channelMetaRaw &&
    typeof channelMetaRaw === 'object' &&
    !Array.isArray(channelMetaRaw)
      ? (channelMetaRaw as Record<string, unknown>)
      : undefined;

  return { channel, channelMeta };
}

export function shanghaiTodayLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'long',
  }).format(new Date());
}
