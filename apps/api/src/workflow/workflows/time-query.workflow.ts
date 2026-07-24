import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { workflowId } from '../workflow.decorator.js';
import type { WorkflowProvider } from '../workflow.types.js';

const inputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('IANA 时区名称，如 Asia/Shanghai，默认 Asia/Shanghai'),
});

const outputSchema = z.object({
  time: z.string(),
  timezone: z.string(),
});

const getTimeStep = createStep({
  id: 'get-time',
  description: '获取指定时区的当前时间',
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const timezone = inputData.timezone || 'Asia/Shanghai';
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    return { time: formatter.format(new Date()), timezone };
  },
});

export const timeQueryWorkflow = createWorkflow({
  id: 'time-query-workflow',
  description: '查询指定时区的当前时间。需要获取真实当前时间时调用。',
  inputSchema,
  outputSchema,
})
  .then(getTimeStep)
  .commit();

/**
 * 从旧项目 time-query-workflow-01（JSON DSL + 事件链）移植而来，
 * 现为 Mastra 原生代码工作流，挂载到 Agent 后自动成为
 * `workflow-time-query-workflow` 工具。
 */
@workflowId('time-query-workflow')
export class TimeQueryWorkflow implements WorkflowProvider {
  readonly name = '时间查询工作流';
  readonly description = '查询指定时区的当前时间。需要获取真实当前时间时调用。';
  readonly inputSchema = inputSchema;
  readonly workflow = timeQueryWorkflow;
}
