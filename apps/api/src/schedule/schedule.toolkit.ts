import { createTool } from '@mastra/core/tools';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { toolkitId } from '../toolkit/toolkit.decorator.js';
import {
  REQUEST_CONTEXT_KEYS,
  SCHEDULE_CHANNELS,
  type ToolkitDefinition,
} from '../toolkit/toolkit.types.js';
import { ScheduleService } from './schedule.service.js';

const TOOLKIT_ID = 'schedule-toolkit';

function requireContextString(
  requestContext: {
    get: (key: string) => unknown;
  },
  key: string,
  label: string,
): string {
  const value = requestContext.get(key);
  if (typeof value !== 'string' || !value) {
    throw new Error(`缺少${label}上下文，无法操作定时任务`);
  }
  return value;
}

/**
 * 定时任务工具包：创建 / 查询 / 取消。
 *
 * 语义：
 * - 仅在用户明确要求「将来某时刻再做」时创建
 * - 到期指令带【定时任务到期 · 立即执行】标记，必须当场处理，禁止再预约
 * - 指令本身不写入 session，仅 Agent 回复落库到创建时的会话；渠道只负责触达
 */
@toolkitId(TOOLKIT_ID)
export class ScheduleToolkit implements ToolkitDefinition {
  readonly name = '定时任务';
  readonly description =
    '仅用于预约「将来」要做的事。到期后系统会把带【定时任务到期 · 立即执行】的指令交给模型立刻执行；该指令不会出现在会话记录里，只有你的回复会写入原会话。禁止在到期场景再次调用本工具包。';
  readonly tools: ToolsInput;

  constructor(private readonly scheduleService: ScheduleService) {
    this.tools = {
      create_scheduled_task: createTool({
        id: 'create-scheduled-task',
        description:
          '仅当用户明确要求在「未来某个时间」再执行某事时调用（如「3 分钟后提醒我」「明天下午三点汇总待办」）。' +
          '不要用于当下立刻要做的事。' +
          '若输入以「【定时任务到期 · 立即执行】」开头，说明任务已到期：必须立刻按其中「指令」处理并直接回复，' +
          '绝对不要再次调用本工具，也不要重新预约。该到期指令不会写入会话，只有你的回复会显示给用户。' +
          '请提供 runAt（ISO 8601）或 delaySeconds 之一。',
        inputSchema: z.object({
          message: z
            .string()
            .min(1)
            .describe(
              '到期后要「立即执行」的指令原文（写给未来的自己/Agent，不是预约话术）。' +
                '正确示例：「提醒用户站起来活动一下」「汇总并列出今天的待办」。' +
                '错误示例：「帮我创建一个定时任务」「三分钟后再提醒我」（到期后会再次误触发预约）。',
            ),
          runAt: z
            .string()
            .optional()
            .describe(
              '执行时间，ISO 8601，如 2026-08-01T15:30:00+08:00；与 delaySeconds 二选一',
            ),
          delaySeconds: z
            .number()
            .int()
            .min(1)
            .max(90 * 24 * 60 * 60)
            .optional()
            .describe('多少秒后执行；与 runAt 二选一，适合「N 分钟后提醒」'),
        }),
        execute: async ({ message, runAt, delaySeconds }, context) => {
          if (!runAt && delaySeconds == null) {
            throw new Error('请提供 runAt 或 delaySeconds');
          }
          const userId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.userId,
            '用户',
          );
          const agentId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.agentId,
            '智能体',
          );
          const sessionId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.sessionId,
            '会话',
          );
          const channelRaw = context.requestContext.get(
            REQUEST_CONTEXT_KEYS.channel,
          );
          const channel =
            typeof channelRaw === 'string' &&
            (SCHEDULE_CHANNELS as readonly string[]).includes(channelRaw)
              ? channelRaw
              : 'web';
          const channelMetaRaw = context.requestContext.get(
            REQUEST_CONTEXT_KEYS.channelMeta,
          );
          const channelMeta =
            channelMetaRaw &&
            typeof channelMetaRaw === 'object' &&
            !Array.isArray(channelMetaRaw)
              ? (channelMetaRaw as Record<string, unknown>)
              : undefined;

          const when = this.scheduleService.resolveRunAt({
            runAt,
            delaySeconds,
          });

          const task = await this.scheduleService.create({
            userId,
            agentId,
            sessionId,
            message,
            channel,
            channelMeta,
            runAt: when,
          });

          return {
            ...task,
            tip: `已创建。到期后仅把 Agent 回复写入当前会话（session=${task.sessionId}），到期指令本身不落库；渠道 ${channel} 负责提醒`,
          };
        },
      }),

      list_scheduled_tasks: createTool({
        id: 'list-scheduled-tasks',
        description:
          '列出当前智能体下的定时任务。默认只返回待执行/执行中的任务；includeFinished=true 时包含已完成/失败/已取消。' +
          '若当前消息带「【定时任务到期 · 立即执行】」标记，不要调用本工具，直接执行指令。',
        inputSchema: z.object({
          includeFinished: z
            .boolean()
            .optional()
            .describe('是否包含已结束的任务，默认 false'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('最多返回条数，默认 20'),
        }),
        execute: async ({ includeFinished, limit }, context) => {
          const userId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.userId,
            '用户',
          );
          const agentId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.agentId,
            '智能体',
          );
          const tasks = await this.scheduleService.list(userId, agentId, {
            includeFinished,
            limit,
          });
          return { count: tasks.length, tasks };
        },
      }),

      cancel_scheduled_task: createTool({
        id: 'cancel-scheduled-task',
        description:
          '取消一个尚未执行的定时任务（仅 pending 可取消）。' +
          '若当前消息带「【定时任务到期 · 立即执行】」标记，不要调用本工具，直接执行指令。',
        inputSchema: z.object({
          taskId: z.string().min(1).describe('定时任务 ID'),
        }),
        execute: async ({ taskId }, context) => {
          const userId = requireContextString(
            context.requestContext,
            REQUEST_CONTEXT_KEYS.userId,
            '用户',
          );
          const task = await this.scheduleService.cancel(userId, taskId);
          return { success: true, task };
        },
      }),
    };
  }
}
