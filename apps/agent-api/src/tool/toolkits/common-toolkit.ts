import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

dayjs.extend(utc);
dayjs.extend(timezone);

@toolkitId('common-toolkit-01')
export class CommonToolkit extends BaseToolkit {
  name = '通用工具箱';
  description = '基础通用工具，提供时间查询、等待等常用操作';
  settings = {};

  tools: ToolsType[] = [];

  constructor() {
    super(); // BaseToolkit会自动处理异步初始化
  }

  validateSettings(): void {
    // No settings to validate
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules = await this.llamaindexService.getLlamaindexModules()
    const FunctionTool = llamaindexModules.FunctionTool
    this.tools = [
      FunctionTool.from(this.getCurrentTime.bind(this), {
        name: 'getCurrentTime',
        description: '获取指定时区的当前时间',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description:
                'IANA 时区标识符，如 "Asia/Shanghai"、"UTC"。可选，默认 Asia/Shanghai',
            },
          },
          required: [],
        },
      }),
      FunctionTool.from(this.wait.bind(this), {
        name: 'wait',
        description:
          '等待指定秒数后返回。适用于等待异步工作流执行完成后再查询结果。最大等待 300 秒。',
        parameters: {
          type: 'object',
          properties: {
            seconds: {
              type: 'number',
              description: '等待时间（秒），最大 300 秒',
            },
          },
          required: ['seconds'],
        },
      }),
    ];
  }

  async getCurrentTime(params: { timezone?: string }): Promise<string> {
    const { timezone = 'Asia/Shanghai' } = params;

    try {
      return dayjs().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
    } catch (error) {
      return `Failed to get current time: ${(error as Error).message}`;
    }
  }

  async wait(params: { seconds: number }): Promise<string> {
    const seconds = Math.min(Math.max(params.seconds, 0), 300);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return `等待 ${seconds} 秒完成`;
  }
}
