import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { toolkitId } from '../toolkit.decorator.js';
import type { ToolkitDefinition } from '../toolkit.types.js';

const getCurrentTime = createTool({
  id: 'get-current-time',
  description: '查询指定时区的当前时间，返回格式化的日期时间字符串',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA 时区名称，如 Asia/Shanghai、America/New_York，默认 Asia/Shanghai'),
  }),
  outputSchema: z.object({
    time: z.string(),
    timezone: z.string(),
    timestamp: z.number(),
  }),
  execute: async ({ timezone }) => {
    const tz = timezone || 'Asia/Shanghai';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    return {
      time: formatter.format(now),
      timezone: tz,
      timestamp: now.getTime(),
    };
  },
});

const wait = createTool({
  id: 'wait',
  description: '等待指定秒数后返回，用于需要延时的场景（最长 300 秒）',
  inputSchema: z.object({
    seconds: z.number().min(0).max(300).describe('等待秒数，0-300'),
  }),
  outputSchema: z.object({
    waited: z.number(),
  }),
  execute: async ({ seconds }) => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { waited: seconds };
  },
});

@toolkitId('common-toolkit')
export class CommonToolkit implements ToolkitDefinition {
  readonly name = '通用工具';
  readonly description = '时间查询、等待等基础工具';
  readonly tools = { getCurrentTime, wait };
}
