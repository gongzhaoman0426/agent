import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';
import { ScheduledTaskService } from '../../scheduled-task/scheduled-task.service';

@toolkitId('scheduled-task-toolkit-01')
export class ScheduledTaskToolkit extends BaseToolkit {
  name = '定时任务工具箱';
  description = '定时任务工具包，支持创建、查询、修改和删除定时任务。定时任务会在指定时间自动向智能体发送消息并获取回复。';
  tools: ToolsType[] = [];
  settings = {};

  constructor(private readonly scheduledTaskService: ScheduledTaskService) {
    super();
  }

  validateSettings(): void {
    // 无需额外配置
  }

  protected async initTools(): Promise<void> {
    const llamaindexModules = await this.llamaindexService.getLlamaindexModules();
    const FunctionTool = llamaindexModules.FunctionTool;

    this.tools = [
      FunctionTool.from(this.createScheduledTask.bind(this), {
        name: 'createScheduledTask',
        description: '创建一个定时任务。到达指定时间后，系统会以用户口吻向智能体发送消息，智能体处理后返回结果。cron 表达式示例：每天9点="0 9 * * *"，每周一到周五9点="0 9 * * 1-5"，每小时="0 * * * *"，每30分钟="*/30 * * * *"',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: '定时任务名称，如"每日待办提醒"',
            },
            cron: {
              type: 'string',
              description: 'cron 表达式，定义执行时间。格式：分 时 日 月 周。例如 "0 9 * * *" 表示每天早上9点',
            },
            userPrompt: {
              type: 'string',
              description: '到达触发时间时，作为用户发送给智能体的指令。必须站在用户的角度编写，就像用户亲自对智能体说话一样。例如：用户说"每天提醒我喝水"，userPrompt 应为"提醒我喝水"；用户说"每隔5分钟给我发一句你好"，userPrompt 应为"对我说一句你好"',
            },
            agentId: {
              type: 'string',
              description: '目标智能体ID。不提供则使用当前智能体',
            },
          },
          required: ['name', 'cron', 'userPrompt'],
        },
      }),
      FunctionTool.from(this.listScheduledTasks.bind(this), {
        name: 'listScheduledTasks',
        description: '列出当前用户的所有定时任务，包括任务名称、cron 表达式、启用状态等',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      }),
      FunctionTool.from(this.getScheduledTaskDetail.bind(this), {
        name: 'getScheduledTaskDetail',
        description: '查看指定定时任务的详细信息，包括上次执行时间和执行结果',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: '定时任务ID，从 listScheduledTasks 获取',
            },
          },
          required: ['taskId'],
        },
      }),
      FunctionTool.from(this.updateScheduledTask.bind(this), {
        name: 'updateScheduledTask',
        description: '更新定时任务的配置，如修改执行时间、消息内容、启用/禁用等',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: '定时任务ID',
            },
            name: {
              type: 'string',
              description: '新的任务名称',
            },
            cron: {
              type: 'string',
              description: '新的 cron 表达式',
            },
            userPrompt: {
              type: 'string',
              description: '新的用户指令内容',
            },
            enabled: {
              type: 'boolean',
              description: '是否启用。设为 false 可暂停任务',
            },
          },
          required: ['taskId'],
        },
      }),
      FunctionTool.from(this.deleteScheduledTask.bind(this), {
        name: 'deleteScheduledTask',
        description: '永久删除一个定时任务。此操作不可撤销。',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: '要删除的定时任务ID',
            },
          },
          required: ['taskId'],
        },
      }),
    ];
  }

  async createScheduledTask(params: {
    name: string;
    cron: string;
    userPrompt: string;
    agentId?: string;
  }): Promise<string> {
    try {
      const task = await this.scheduledTaskService.createTask({
        name: params.name,
        cron: params.cron,
        userPrompt: params.userPrompt,
        agentId: params.agentId || this.agentId,
        userId: this.userId,
        sessionId: this.sessionId,
      });
      return JSON.stringify({
        success: true,
        task: {
          id: task.id,
          name: task.name,
          cron: task.cron,
          userPrompt: task.userPrompt,
          enabled: task.enabled,
        },
      }, null, 2);
    } catch (error: any) {
      this.logger.error(`[Tool:createScheduledTask] Error: ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async listScheduledTasks(): Promise<string> {
    try {
      const tasks = await this.scheduledTaskService.listTasks(this.userId);
      const result = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        cron: t.cron,
        userPrompt: t.userPrompt,
        enabled: t.enabled,
        lastRunAt: t.lastRunAt,
        createdAt: t.createdAt,
      }));
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      this.logger.error(`[Tool:listScheduledTasks] Error: ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async getScheduledTaskDetail(params: { taskId: string }): Promise<string> {
    try {
      const task = await this.scheduledTaskService.getTask(params.taskId, this.userId);
      return JSON.stringify(task, null, 2);
    } catch (error: any) {
      this.logger.error(`[Tool:getScheduledTaskDetail] Error: ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async updateScheduledTask(params: {
    taskId: string;
    name?: string;
    cron?: string;
    userPrompt?: string;
    enabled?: boolean;
  }): Promise<string> {
    try {
      const { taskId, ...updateData } = params;
      const task = await this.scheduledTaskService.updateTask(taskId, this.userId, updateData);
      return JSON.stringify({
        success: true,
        task: {
          id: task.id,
          name: task.name,
          cron: task.cron,
          userPrompt: task.userPrompt,
          enabled: task.enabled,
        },
      }, null, 2);
    } catch (error: any) {
      this.logger.error(`[Tool:updateScheduledTask] Error: ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }

  async deleteScheduledTask(params: { taskId: string }): Promise<string> {
    try {
      await this.scheduledTaskService.deleteTask(params.taskId, this.userId);
      return JSON.stringify({ success: true, userPrompt: '定时任务已删除' }, null, 2);
    } catch (error: any) {
      this.logger.error(`[Tool:deleteScheduledTask] Error: ${error.message}`, error.stack);
      return JSON.stringify({ error: error.message }, null, 2);
    }
  }
}
