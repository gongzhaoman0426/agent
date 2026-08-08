import { Injectable, Logger } from '@nestjs/common';
import type { WechatAccount } from '@prisma/client';
import { AgentService } from '../agent/agent.service.js';
import { ChatService } from '../agent/chat.service.js';
import { ToolkitService } from '../toolkit/toolkit.service.js';
import type { ToolkitSettings } from '../toolkit/toolkit.types.js';
import type { ParsedPadMessage } from './pad/types.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatAdminService } from './wechat-admin.service.js';
import { WechatFriendRequestService } from './wechat-friend-request.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import {
  FILE_HELPER,
  WechatReplyGateService,
} from './wechat-reply-gate.service.js';
import { WechatTransferService } from './wechat-transfer.service.js';
import { buildWechatSessionId } from './wechat.paths.js';

const TEXT_MSG_TYPE = 1;
const APPMSG_MSG_TYPE = 49;
const VERIFY_MSG_TYPE = 37;

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
    private readonly transfers: WechatTransferService,
    private readonly friendRequests: WechatFriendRequestService,
    private readonly admin: WechatAdminService,
    private readonly toolkits: ToolkitService,
    private readonly replyGate: WechatReplyGateService,
  ) {}

  async handleParsed(row: WechatAccount, msg: ParsedPadMessage): Promise<void> {
    // 自己 → 文件传输助手：暂停/恢复整号自动回复
    const gateCmd = this.replyGate.parseFileHelperCommand({
      accountWxid: row.wxid,
      fromWxid: msg.fromWxid,
      toWxid: msg.toWxid,
      msgType: msg.msgType,
      content: msg.content,
    });
    if (gateCmd) {
      await this.handleReplyGateCommand(row, gateCmd);
      return;
    }

    const peerWxid = msg.fromWxid.trim();
    if (!peerWxid) return;

    if (peerWxid === row.wxid) return;
    if (peerWxid.includes('@chatroom')) return;
    if (peerWxid === 'newsapp' || peerWxid === FILE_HELPER) return;
    if (peerWxid.endsWith('@app') || peerWxid.startsWith('gh_')) return;
    if (msg.toWxid.includes('@chatroom')) return;

    if (this.replyGate.isPaused(row.id)) {
      this.logger.debug(
        `自动回复已暂停，忽略私聊 account=${row.id} from=${peerWxid}`,
      );
      return;
    }

    // 好友请求：缓存后通知已提权管理员
    if (msg.msgType === VERIFY_MSG_TYPE) {
      const remembered = this.friendRequests.rememberFromVerifyMsg({
        accountId: row.id,
        msgType: msg.msgType,
        content: msg.content,
      });
      if (!remembered) return;
      this.logger.log(
        `收到好友请求 wxid=${row.wxid} from=${remembered.pending.fromWxid}`,
      );
      await this.notifyAdmins(row, remembered.prompt);
      return;
    }

    let text = '';

    if (msg.msgType === APPMSG_MSG_TYPE) {
      const remembered = this.transfers.rememberFromAppMsg({
        accountId: row.id,
        accountWxid: row.wxid,
        peerWxid,
        content: msg.content,
      });
      if (!remembered) {
        this.logger.debug(`忽略非转账 appmsg from=${peerWxid}`);
        return;
      }
      text = remembered.prompt;
      this.logger.log(
        `收到转账 wxid=${row.wxid} from=${peerWxid} ${remembered.pending.feeDesc}`,
      );
    } else if (msg.msgType === TEXT_MSG_TYPE) {
      text = msg.content.trim();
      if (!text) return;

      // 管理员密钥：整段消息匹配则提权，密钥不进入模型上下文
      const settings = await this.getWechatToolkitSettings(row.userId);
      const elevated = this.admin.tryElevate({
        accountId: row.id,
        peerWxid,
        message: text,
        adminSecret: settings.adminSecret,
        // 勿用 || 24，否则 0（永久）会被当成 24
        ttlHours: settings.adminTtlHours,
      });
      if (elevated) {
        text = elevated;
        this.logger.log(`管理员密钥认证成功 peer=${peerWxid}`);
      } else {
        this.logger.log(
          `收到私聊 wxid=${row.wxid} from=${peerWxid} text=${text.slice(0, 80)}`,
        );
      }
    } else {
      this.logger.debug(
        `忽略非文本/转账/好友请求消息 type=${msg.msgType} from=${peerWxid}`,
      );
      return;
    }

    await this.runAgentReply(row, peerWxid, text);
  }

  private async handleReplyGateCommand(
    row: WechatAccount,
    command: 'pause' | 'resume',
  ) {
    if (command === 'pause') {
      this.replyGate.pause(row.id);
      await this.outbound.sendByDbId({
        accountDbId: row.id,
        peerWxid: FILE_HELPER,
        text: '已暂停自动回复。向文件传输助手发送「恢复」可重新开启。',
      });
      return;
    }

    this.replyGate.resume(row.id);
    await this.outbound.sendByDbId({
      accountDbId: row.id,
      peerWxid: FILE_HELPER,
      text: '已恢复自动回复。',
    });
  }

  private async notifyAdmins(row: WechatAccount, prompt: string) {
    if (this.replyGate.isPaused(row.id)) {
      this.logger.debug(`自动回复已暂停，跳过好友请求通知 account=${row.id}`);
      return;
    }
    const admins = this.admin.listActiveAdminPeers(row.id);
    if (admins.length === 0) {
      this.logger.warn(
        `有好友请求但无在线管理员会话 account=${row.id}；管理员需先密钥提权后再处理`,
      );
      return;
    }
    for (const adminPeer of admins) {
      try {
        await this.runAgentReply(row, adminPeer, prompt);
      } catch (error) {
        this.logger.error(
          `通知管理员失败 peer=${adminPeer}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async runAgentReply(
    row: WechatAccount,
    peerWxid: string,
    text: string,
  ) {
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
          `已通过媒体/工具处理，跳过文本回复 peer=${peerWxid}`,
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

  private async getWechatToolkitSettings(
    userId: string,
  ): Promise<ToolkitSettings> {
    const map = await this.toolkits.getSettingsMap(userId);
    const raw = map['wechat-toolkit'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as ToolkitSettings;
    }
    return {};
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
