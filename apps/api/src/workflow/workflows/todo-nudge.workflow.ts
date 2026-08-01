import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { ScheduleService } from '../../schedule/schedule.service.js';
import { REQUEST_CONTEXT_KEYS } from '../../toolkit/toolkit.types.js';
import {
  readWorkflowChannel,
  requireWorkflowContextString,
} from '../workflow-context.js';
import { workflowId } from '../workflow.decorator.js';
import type { WorkflowProvider } from '../workflow.types.js';

const WORKFLOW_ID = 'todo-nudge';

const inputSchema = z.object({
  item: z
    .string()
    .min(1)
    .max(500)
    .describe('待办事项内容，如「提交报销单」「给妈妈打电话」'),
  runAt: z
    .string()
    .optional()
    .describe(
      '提醒时间，ISO 8601，如 2026-08-01T18:00:00+08:00；与 delaySeconds 二选一',
    ),
  delaySeconds: z
    .number()
    .int()
    .min(1)
    .max(90 * 24 * 60 * 60)
    .optional()
    .describe('多少秒后提醒；与 runAt 二选一'),
});

const outputSchema = z.object({
  taskId: z.string(),
  item: z.string(),
  runAt: z.string(),
  channel: z.string(),
  sessionId: z.string(),
  dueMessage: z.string(),
  tip: z.string(),
});

function buildDueMessage(item: string): string {
  return (
    `请用简洁口语提醒用户完成待办「${item}」，并明确追问：这件事做完了吗？` +
    `若用户表示还没做，给一句简短的下一步建议；不要再次创建或修改定时任务。`
  );
}

@workflowId(WORKFLOW_ID)
export class TodoNudgeWorkflow implements WorkflowProvider {
  readonly name = '待办催办';
  readonly description =
    '输入待办事项与截止/提醒时间，创建定时催办：到期后用固定话术复述事项并追问「做完了吗」。不要用于当下立刻要做的事。';
  readonly inputSchema = inputSchema;
  readonly workflow: Workflow<any, any, any, any, any, any>;

  constructor(private readonly scheduleService: ScheduleService) {
    const nudgeStep = createStep({
      id: 'create-nudge-task',
      description: '创建带固定催办话术的定时任务',
      inputSchema,
      outputSchema,
      execute: async ({ inputData, requestContext }) => {
        if (!inputData.runAt && inputData.delaySeconds == null) {
          throw new Error('请提供 runAt 或 delaySeconds');
        }

        const userId = requireWorkflowContextString(
          requestContext,
          REQUEST_CONTEXT_KEYS.userId,
          '用户',
        );
        const agentId = requireWorkflowContextString(
          requestContext,
          REQUEST_CONTEXT_KEYS.agentId,
          '智能体',
        );
        const sessionId = requireWorkflowContextString(
          requestContext,
          REQUEST_CONTEXT_KEYS.sessionId,
          '会话',
        );
        const { channel, channelMeta } = readWorkflowChannel(requestContext);

        const item = inputData.item.trim();
        const dueMessage = buildDueMessage(item);
        const runAt = this.scheduleService.resolveRunAt({
          runAt: inputData.runAt,
          delaySeconds: inputData.delaySeconds,
        });

        const task = await this.scheduleService.create({
          userId,
          agentId,
          sessionId,
          message: dueMessage,
          channel,
          channelMeta,
          runAt,
        });

        return {
          taskId: task.id,
          item,
          runAt: task.runAt,
          channel: task.channel,
          sessionId: task.sessionId,
          dueMessage,
          tip: `已预约催办。到期后会在当前会话催问「${item}」是否做完（渠道 ${task.channel}）。`,
        };
      },
    });

    this.workflow = createWorkflow({
      id: WORKFLOW_ID,
      description: this.description,
      inputSchema,
      outputSchema,
    })
      .then(nudgeStep)
      .commit();
  }
}
