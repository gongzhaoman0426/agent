import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScheduledTaskService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    await this.loadAllTasks();
  }

  private async getAgentService() {
    const { AgentService } = require('../agent/agent.service');
    return this.moduleRef.get(AgentService, { strict: false });
  }

  private async getLlamaindexService() {
    const { LlamaindexService } = require('../llamaindex/llamaindex.service');
    return this.moduleRef.get(LlamaindexService, { strict: false });
  }

  private async getToolsService() {
    const { ToolsService } = require('../tool/tools.service');
    return this.moduleRef.get(ToolsService, { strict: false });
  }

  private async loadAllTasks() {
    const tasks = await this.prisma.scheduledTask.findMany({
      where: { enabled: true },
    });
    for (const task of tasks) {
      this.registerCronJob(task);
    }
    this.logger.log(`Loaded ${tasks.length} scheduled tasks`);
  }

  private registerCronJob(task: { id: string; cron: string; userPrompt: string; agentId: string; userId: string }) {
    try {
      // 先移除已有的同名任务
      this.removeCronJobIfExists(task.id);

      const job = new CronJob(task.cron, () => {
        this.executeTask(task.id).catch((err) =>
          this.logger.error(`Scheduled task ${task.id} execution failed: ${err.message}`),
        );
      });

      this.schedulerRegistry.addCronJob(task.id, job);
      job.start();
      this.logger.log(`Registered cron job: ${task.id} (${task.cron})`);
    } catch (error: any) {
      this.logger.error(`Failed to register cron job ${task.id}: ${error.message}`);
    }
  }

  private removeCronJobIfExists(taskId: string) {
    try {
      this.schedulerRegistry.deleteCronJob(taskId);
    } catch {
      // job doesn't exist, ignore
    }
  }

  private async executeTask(taskId: string) {
    const task = await this.prisma.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task || !task.enabled) return;

    this.logger.log(`Executing scheduled task: ${task.name} (${taskId})`);

    try {
      const agentService = await this.getAgentService();
      const llamaindexService = await this.getLlamaindexService();
      const toolsService = await this.getToolsService();

      // 获取 agent 配置和工具
      const agent = await agentService.findOne(task.agentId);
      const tools = await toolsService.getAgentTools(task.agentId);

      // 直接创建 agent 实例执行，不走 chatWithAgent
      const agentInstance = await llamaindexService.createAgent(tools, agent.prompt);
      const response = await agentInstance.run(task.userPrompt);
      const resultStr = response.data.result;

      // 将 agent 回复存入创建任务时的 session（只存 assistant 消息，不存 userPrompt）
      await this.prisma.chatMessage.create({
        data: {
          role: 'assistant',
          content: resultStr,
          sessionId: task.sessionId,
        },
      });

      // 更新定时任务的 lastResult（任务可能已被删除，忽略错误）
      await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: { lastRunAt: new Date(), lastResult: resultStr.substring(0, 4000) },
      }).catch(() => {});

      this.logger.log(`Scheduled task ${task.name} completed successfully`);
    } catch (error: any) {
      await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: { lastRunAt: new Date(), lastResult: `ERROR: ${error.message}` },
      }).catch(() => {});
      this.logger.error(`Scheduled task ${task.name} failed: ${error.message}`);
    }
  }

  async createTask(data: {
    name: string;
    cron: string;
    userPrompt: string;
    agentId: string;
    userId: string;
    sessionId: string;
  }) {
    const task = await this.prisma.scheduledTask.create({ data });
    this.registerCronJob(task);
    return task;
  }

  async updateTask(
    taskId: string,
    userId: string,
    data: { name?: string; cron?: string; userPrompt?: string; enabled?: boolean },
  ) {
    const existing = await this.prisma.scheduledTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('定时任务不存在或无权限操作');
    }

    const updated = await this.prisma.scheduledTask.update({
      where: { id: taskId },
      data,
    });

    // 重新注册或移除 cron job
    if (updated.enabled) {
      this.registerCronJob(updated);
    } else {
      this.removeCronJobIfExists(taskId);
    }

    return updated;
  }

  async deleteTask(taskId: string, userId: string) {
    const existing = await this.prisma.scheduledTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('定时任务不存在或无权限操作');
    }

    this.removeCronJobIfExists(taskId);
    await this.prisma.scheduledTask.delete({ where: { id: taskId } });
  }

  async listTasks(userId: string) {
    return this.prisma.scheduledTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTask(taskId: string, userId: string) {
    const task = await this.prisma.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) {
      throw new Error('定时任务不存在或无权限操作');
    }
    return task;
  }

  /**
   * 查询指定 sessionId 前缀下、在 since 之后有新结果的定时任务
   * 用于飞书 bot 轮询推送
   */
  async getNewResults(sessionPrefix: string, since: Date) {
    return this.prisma.scheduledTask.findMany({
      where: {
        enabled: true,
        sessionId: { startsWith: sessionPrefix },
        lastRunAt: { gt: since },
        lastResult: { not: null },
      },
      select: {
        id: true,
        name: true,
        sessionId: true,
        lastRunAt: true,
        lastResult: true,
      },
      orderBy: { lastRunAt: 'asc' },
    });
  }
}
