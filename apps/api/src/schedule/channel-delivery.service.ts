import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ScheduleChannel } from '../toolkit/toolkit.types.js';
import { WechatOutboundService } from '../wechat/wechat-outbound.service.js';

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
  channelMeta?: Record<string, unknown> | null;
}

/**
 * 渠道侧「触达」通知（对话消息本身已由 ChatService 写入创建时的 session）。
 * - web：前端 inbox 轮询后 ack
 * - wechat：SendTextMessage 推送到对端
 */
@Injectable()
export class ChannelDeliveryService {
  private readonly logger = new Logger(ChannelDeliveryService.name);

  constructor(
    @Optional() private readonly wechatOutbound?: WechatOutboundService,
  ) {}

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
    if (!this.wechatOutbound) {
      this.logger.warn(
        `WeChat 出站服务未就绪，任务 ${payload.taskId} 仅写入 session`,
      );
      return false;
    }

    const meta = payload.channelMeta ?? {};
    const peerWxid = String(meta.peerWxid ?? meta.peerUserId ?? '');
    const accountDbId = String(meta.accountId ?? meta.accountDbId ?? '');
    const text = payload.response?.trim();

    if (!text || !peerWxid || !accountDbId) {
      this.logger.warn(
        `WeChat 投递缺少 account/peer/response，task=${payload.taskId}`,
      );
      return false;
    }

    const ok = await this.wechatOutbound.sendByDbId({
      accountDbId,
      peerWxid,
      text,
    });

    if (!ok) {
      this.logger.warn(`WeChat 投递失败 task=${payload.taskId}`);
    }
    return ok;
  }
}
