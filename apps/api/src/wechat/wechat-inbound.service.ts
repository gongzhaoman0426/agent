import { Injectable, Logger } from '@nestjs/common';
import type { WechatAccount } from '@prisma/client';
import { AgentService } from '../agent/agent.service.js';
import { ChatService } from '../agent/chat.service.js';
import type { ParsedPadMessage } from './pad/types.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { buildWechatSessionId } from './wechat.paths.js';

const TEXT_MSG_TYPE = 1;

export type ForwardWebhookBody = {
  msgType?: number;
  msgContent?: string;
  FromUserName?: string;
  ToUserName?: string;
  pushContent?: string;
  beAtUser?: string;
  msg_id?: number | string;
  new_msg_id?: number | string;
};

@Injectable()
export class WechatInboundService {
  private readonly logger = new Logger(WechatInboundService.name);

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly agentService: AgentService,
    private readonly chatService: ChatService,
    private readonly outbound: WechatOutboundService,
  ) {}

  async handleParsed(row: WechatAccount, msg: ParsedPadMessage): Promise<void> {
    if (msg.msgType !== TEXT_MSG_TYPE) {
      this.logger.debug(
        `忽略非文本消息 type=${msg.msgType} from=${msg.fromWxid}`,
      );
      return;
    }

    const peerWxid = msg.fromWxid.trim();
    if (!peerWxid) return;

    if (peerWxid === row.wxid) return;
    if (peerWxid.includes('@chatroom')) return;
    if (peerWxid === 'newsapp' || peerWxid === 'filehelper') return;
    if (peerWxid.endsWith('@app') || peerWxid.startsWith('gh_')) return;

    let text = msg.content.trim();
    if (!text) return;

    // 群消息格式 wxid:\ntext —— 若误入则丢弃
    if (msg.toWxid.includes('@chatroom')) return;

    this.logger.log(
      `收到私聊 wxid=${row.wxid} from=${peerWxid} text=${text.slice(0, 80)}`,
    );

    const sessionId = buildWechatSessionId(row.agentId, row.id, peerWxid);

    try {
      const agent = await this.agentService.findOwned(
        row.agentId,
        row.userId,
      );

      const result = await this.chatService.chat(
        agent,
        {
          message: text,
          sessionId,
          channel: 'wechat',
        },
        row.userId,
        {
          channelMeta: {
            accountId: row.id,
            agentId: row.agentId,
            peerWxid,
            accountDbId: row.id,
            peerUserId: peerWxid,
          },
        },
      );

      if (result.skipTextReply) {
        this.logger.log(
          `已通过语音/图片送达，跳过文本回复 peer=${peerWxid}`,
        );
      } else if (result.response?.trim()) {
        const ok = await this.outbound.sendByDbId({
          accountDbId: row.id,
          peerWxid,
          text: result.response,
        });
        this.logger.log(
          `自动回复 ${ok ? '成功' : '失败'} to=${peerWxid} len=${result.response.length}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `处理微信消息失败 peer=${peerWxid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.outbound.sendByDbId({
        accountDbId: row.id,
        peerWxid,
        text: `处理失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async handleForwardWebhook(
    authKey: string,
    body: ForwardWebhookBody,
  ): Promise<{ ok: boolean; reason?: string }> {
    const row = await this.accounts.findByAuthKey(authKey);
    if (!row || !row.enabled) {
      return { ok: false, reason: 'unknown_or_disabled_account' };
    }

    const msg: ParsedPadMessage = {
      fromWxid: String(body.FromUserName ?? ''),
      toWxid: String(body.ToUserName ?? ''),
      msgType: Number(body.msgType ?? 0),
      content: String(body.msgContent ?? ''),
    };

    await this.handleParsed(row, msg);
    return { ok: true };
  }
}
