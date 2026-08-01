import { Injectable, Logger } from '@nestjs/common';
import type { ScheduleChannel } from '../toolkit/toolkit.types.js';

export interface ChannelDeliveryPayload {
  taskId: string;
  userId: string;
  agentId: string;
  agentName: string;
  message: string;
  response: string;
  /** 创建任务时的会话；对话内容已写入该 session */
  sessionId: string;
  channel: ScheduleChannel | string;
}

/**
 * 渠道侧「触达」通知（对话消息本身已由 ChatService 写入创建时的 session）。
 * - web：前端 inbox 轮询，把新消息刷进原会话后 ack
 * - wechat：预留推送，提醒用户去看同一会话
 */
@Injectable()
export class ChannelDeliveryService {
  private readonly logger = new Logger(ChannelDeliveryService.name);

  /**
   * @returns true 表示渠道已同步投递完成（可立刻写 deliveredAt）；
   *          false 表示需渠道侧确认后再 ack（如 web 拉 inbox）
   */
  async deliver(payload: ChannelDeliveryPayload): Promise<boolean> {
    switch (payload.channel) {
      case 'web':
        return this.deliverWeb(payload);
      case 'wechat':
        return this.deliverWechat(payload);
      default:
        this.logger.warn(
          `未知渠道 ${payload.channel}，任务 ${payload.taskId} 会话已写入，待渠道确认`,
        );
        return false;
    }
  }

  private async deliverWeb(payload: ChannelDeliveryPayload): Promise<boolean> {
    this.logger.log(
      `Web 渠道待同步: ${payload.taskId} → session=${payload.sessionId}`,
    );
    return false;
  }

  private async deliverWechat(
    payload: ChannelDeliveryPayload,
  ): Promise<boolean> {
    // 预留：推送「会话有新回复」，消息体已在 session 中
    this.logger.warn(
      `WeChat 渠道尚未接入，任务 ${payload.taskId} 已写入 session=${payload.sessionId}`,
    );
    return false;
  }
}
