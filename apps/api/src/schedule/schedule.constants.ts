export const SCHEDULE_TASK_STATUS = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
} as const;

export type ScheduleTaskStatus =
  (typeof SCHEDULE_TASK_STATUS)[keyof typeof SCHEDULE_TASK_STATUS];

/** 轮询间隔（毫秒） */
export const SCHEDULE_POLL_INTERVAL_MS = 5_000;

/** 单次最多并发执行的任务数 */
export const SCHEDULE_MAX_CONCURRENCY = 3;

/** 最长可预约时间：90 天 */
export const SCHEDULE_MAX_DELAY_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * 到期投递时包裹用户消息，明确告诉 Agent：这是立刻执行的指令，
 * 不是「再创建一个定时任务」的请求。
 */
export function wrapDueScheduleMessage(message: string): string {
  const body = message.trim();
  return [
    '【定时任务到期 · 立即执行】',
    '以下内容来自此前已创建并刚到期的定时任务。请立刻按指令处理并直接回复用户。',
    '禁止再次调用 create_scheduled_task / list_scheduled_tasks / cancel_scheduled_task；不要追问「要不要定时」、不要重新预约。',
    '',
    '指令：',
    body,
  ].join('\n');
}
