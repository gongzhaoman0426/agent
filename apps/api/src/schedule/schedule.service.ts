import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ScheduledTask } from '@prisma/client';
import { AgentService } from '../agent/agent.service.js';
import { ChatService } from '../agent/chat.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SCHEDULE_CHANNELS,
  type ScheduleChannel,
} from '../toolkit/toolkit.types.js';
import { ChannelDeliveryService } from './channel-delivery.service.js';
import {
  SCHEDULE_MAX_DELAY_MS,
  SCHEDULE_TASK_STATUS,
  wrapDueScheduleMessage,
} from './schedule.constants.js';

export interface CreateScheduledTaskInput {
  userId: string;
  agentId: string;
  /** 创建任务时所在会话；到期后复用该会话写入用户句 + Agent 回复 */
  sessionId: string;
  message: string;
  channel: string;
  runAt: Date;
  channelMeta?: Record<string, unknown>;
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly chatService: ChatService,
    private readonly channelDelivery: ChannelDeliveryService,
  ) {}

  async create(input: CreateScheduledTaskInput) {
    this.assertChannel(input.channel);
    this.assertRunAt(input.runAt);
    if (!input.sessionId?.trim()) {
      throw new BadRequestException('缺少会话 ID，无法绑定定时任务回写会话');
    }

    // 校验 Agent 归属
    await this.agentService.findOwned(input.agentId, input.userId);

    const task = await this.prisma.scheduledTask.create({
      data: {
        userId: input.userId,
        agentId: input.agentId,
        message: input.message.trim(),
        channel: input.channel,
        ...(input.channelMeta
          ? {
              channelMeta: input.channelMeta as Prisma.InputJsonValue,
            }
          : {}),
        sessionId: input.sessionId.trim(),
        runAt: input.runAt,
        status: SCHEDULE_TASK_STATUS.pending,
      },
    });

    return this.toPublic(task);
  }

  async list(
    userId: string,
    agentId: string,
    options?: { includeFinished?: boolean; limit?: number },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const includeFinished = options?.includeFinished ?? false;

    const tasks = await this.prisma.scheduledTask.findMany({
      where: {
        userId,
        agentId,
        ...(includeFinished
          ? {}
          : {
              status: {
                in: [
                  SCHEDULE_TASK_STATUS.pending,
                  SCHEDULE_TASK_STATUS.running,
                ],
              },
            }),
      },
      orderBy: { runAt: 'asc' },
      take: limit,
    });

    return tasks.map((task) => this.toPublic(task));
  }

  async cancel(userId: string, taskId: string) {
    const task = await this.prisma.scheduledTask.findFirst({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('定时任务不存在');
    }
    if (task.status !== SCHEDULE_TASK_STATUS.pending) {
      throw new BadRequestException(
        `只能取消待执行任务，当前状态为 ${task.status}`,
      );
    }

    const updated = await this.prisma.scheduledTask.update({
      where: { id: taskId },
      data: { status: SCHEDULE_TASK_STATUS.cancelled },
    });
    return this.toPublic(updated);
  }

  /** Web 渠道：未投递的已完成任务 */
  async listWebInbox(userId: string, limit = 20) {
    const tasks = await this.prisma.scheduledTask.findMany({
      where: {
        userId,
        channel: 'web',
        status: SCHEDULE_TASK_STATUS.completed,
        deliveredAt: null,
      },
      orderBy: { finishedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return tasks.map((task) => this.toPublic(task));
  }

  async ackDelivered(userId: string, taskIds: string[]) {
    if (taskIds.length === 0) {
      return { acked: 0 };
    }
    const result = await this.prisma.scheduledTask.updateMany({
      where: {
        userId,
        id: { in: taskIds },
        status: SCHEDULE_TASK_STATUS.completed,
        deliveredAt: null,
      },
      data: { deliveredAt: new Date() },
    });
    return { acked: result.count };
  }

  /** Runner 拉取到期任务 */
  async claimDueTasks(limit: number): Promise<ScheduledTask[]> {
    const due = await this.prisma.scheduledTask.findMany({
      where: {
        status: SCHEDULE_TASK_STATUS.pending,
        runAt: { lte: new Date() },
      },
      orderBy: { runAt: 'asc' },
      take: limit,
    });

    const claimed: ScheduledTask[] = [];
    for (const task of due) {
      // 乐观锁：仅 pending → running
      const updated = await this.prisma.scheduledTask.updateMany({
        where: { id: task.id, status: SCHEDULE_TASK_STATUS.pending },
        data: {
          status: SCHEDULE_TASK_STATUS.running,
          startedAt: new Date(),
        },
      });
      if (updated.count === 1) {
        claimed.push({
          ...task,
          status: SCHEDULE_TASK_STATUS.running,
          startedAt: new Date(),
        });
      }
    }
    return claimed;
  }

  /**
   * 执行单个任务：在「创建时的 session」上模拟用户发言（写入用户句 + Agent 回复），
   * 再通知创建渠道（web 拉 inbox / 将来 wechat 推送）。
   */
  async executeTask(task: ScheduledTask): Promise<void> {
    try {
      const agent = await this.agentService.findOwned(task.agentId, task.userId);
      const channel = this.normalizeChannel(task.channel);

      const chatResult = await this.chatService.chat(
        agent,
        {
          message: wrapDueScheduleMessage(task.message),
          sessionId: task.sessionId,
          channel,
        },
        task.userId,
        // 到期指令只作模型输入，不写入 session；会话里只出现 Agent 回复
        { hideUserMessage: true },
      );

      const delivered = await this.channelDelivery.deliver({
        taskId: task.id,
        userId: task.userId,
        agentId: task.agentId,
        agentName: agent.name,
        message: task.message,
        response: chatResult.response,
        sessionId: task.sessionId,
        channel,
      });

      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: SCHEDULE_TASK_STATUS.completed,
          resultText: chatResult.response,
          finishedAt: new Date(),
          ...(delivered ? { deliveredAt: new Date() } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`定时任务 ${task.id} 执行失败: ${message}`);
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: SCHEDULE_TASK_STATUS.failed,
          errorMessage: message.slice(0, 2000),
          finishedAt: new Date(),
        },
      });
    }
  }

  resolveRunAt(input: {
    runAt?: string;
    delaySeconds?: number;
  }): Date {
    if (input.runAt) {
      const date = new Date(input.runAt);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('runAt 不是合法的时间');
      }
      return date;
    }
    if (input.delaySeconds !== undefined) {
      return new Date(Date.now() + input.delaySeconds * 1000);
    }
    throw new BadRequestException('请提供 runAt 或 delaySeconds');
  }

  private assertChannel(channel: string) {
    if (!(SCHEDULE_CHANNELS as readonly string[]).includes(channel)) {
      throw new BadRequestException(
        `不支持的渠道: ${channel}（支持 ${SCHEDULE_CHANNELS.join('、')}）`,
      );
    }
  }

  private normalizeChannel(channel: string): ScheduleChannel {
    if ((SCHEDULE_CHANNELS as readonly string[]).includes(channel)) {
      return channel as ScheduleChannel;
    }
    return 'web';
  }

  private assertRunAt(runAt: Date) {
    const now = Date.now();
    if (runAt.getTime() < now - 5_000) {
      throw new BadRequestException('执行时间不能早于当前时间');
    }
    if (runAt.getTime() - now > SCHEDULE_MAX_DELAY_MS) {
      throw new BadRequestException('执行时间不能超过 90 天');
    }
  }

  private toPublic(task: ScheduledTask) {
    return {
      id: task.id,
      agentId: task.agentId,
      message: task.message,
      channel: task.channel,
      sessionId: task.sessionId,
      runAt: task.runAt.toISOString(),
      status: task.status,
      resultText: task.resultText,
      errorMessage: task.errorMessage,
      deliveredAt: task.deliveredAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      finishedAt: task.finishedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
    };
  }
}
