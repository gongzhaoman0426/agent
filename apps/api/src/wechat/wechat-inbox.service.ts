import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { ChatService } from '../agent/chat.service.js';
import { getContactDetails } from './pad/friend.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { WechatReplyGateService } from './wechat-reply-gate.service.js';
import { buildWechatSessionId } from './wechat.paths.js';

@Injectable()
export class WechatInboxService {
  private readonly logger = new Logger(WechatInboxService.name);

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly chatService: ChatService,
    private readonly agentService: AgentService,
    private readonly outbound: WechatOutboundService,
    private readonly replyGate: WechatReplyGateService,
  ) {}

  async listConversations(userId: string, accountId: string) {
    const account = await this.accounts.findAccessible(accountId, userId);
    this.replyGate.hydrateFromRow(account.id, account.autoReplyPaused);
    const conversations = await this.chatService.listWechatSessions(
      account.userId,
      accountId,
      80,
    );
    return {
      account: this.accounts.toPublic(account),
      autoReplyPaused: this.replyGate.isPaused(account.id),
      conversations: conversations.map((c) => ({
        sessionId: c.id,
        title: c.title,
        agentId: c.agentId,
        agentName: c.agentName,
        peerWxid: c.peerWxid,
        isGroup: c.isGroup,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      })),
    };
  }

  async getConversation(
    userId: string,
    accountId: string,
    peerWxid: string,
  ) {
    const account = await this.accounts.findAccessible(accountId, userId);
    const peer = peerWxid.trim();
    if (!peer) throw new BadRequestException('缺少 peerWxid');

    const sessionId = buildWechatSessionId(
      account.agentId,
      account.id,
      peer,
    );

    let detail: Awaited<ReturnType<ChatService['getSessionDetail']>>;
    try {
      detail = await this.chatService.getSessionDetail(sessionId, account.userId);
    } catch {
      // 尚无历史时返回空会话
      detail = {
        id: sessionId,
        title: peer.includes('@chatroom') ? `微信群 ${peer}` : peer,
        agentId: account.agentId,
        agentName: '',
        createdAt: undefined,
        updatedAt: undefined,
        messages: [],
      };
    }

    this.replyGate.hydrateFromRow(account.id, account.autoReplyPaused);
    return {
      accountId: account.id,
      agentId: account.agentId,
      peerWxid: peer,
      isGroup: peer.includes('@chatroom'),
      autoReplyPaused: this.replyGate.isPaused(account.id),
      sessionId,
      title: detail.title,
      messages: detail.messages,
    };
  }

  async sendManualMessage(input: {
    userId: string;
    accountId: string;
    peerWxid: string;
    text: string;
    splitSegments?: boolean;
  }) {
    const account = await this.accounts.findAccessible(
      input.accountId,
      input.userId,
    );
    const peer = input.peerWxid.trim();
    const text = input.text.trim();
    if (!peer) throw new BadRequestException('缺少 peerWxid');
    if (!text) throw new BadRequestException('消息不能为空');

    const ok = await this.outbound.sendByDbId({
      accountDbId: account.id,
      peerWxid: peer,
      text,
      splitSegments: input.splitSegments ?? false,
    });
    if (!ok) {
      throw new BadRequestException('发送失败：账号未启用或协议异常');
    }

    const sessionId = buildWechatSessionId(
      account.agentId,
      account.id,
      peer,
    );
    try {
      const agent = await this.agentService.findOwned(
        account.agentId,
        account.userId,
      );
      await this.chatService.appendAssistantMessage(agent, {
        sessionId,
        userId: account.userId,
        text: `[人工回复]\n${text}`,
        threadTitle: peer.includes('@chatroom')
          ? `微信群 ${peer}`
          : `微信 ${peer}`,
      });
    } catch (error) {
      this.logger.warn(
        `人工回复已发出但落库失败 peer=${peer}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { success: true, sessionId, peerWxid: peer };
  }

  async setAutoReply(input: {
    userId: string;
    accountId: string;
    paused: boolean;
  }) {
    const account = await this.accounts.findAccessible(
      input.accountId,
      input.userId,
    );
    if (input.paused) {
      await this.replyGate.pause(account.id);
    } else {
      await this.replyGate.resume(account.id);
    }
    const refreshed = await this.accounts.findAccessible(
      input.accountId,
      input.userId,
    );
    return {
      id: refreshed.id,
      autoReplyPaused: Boolean(refreshed.autoReplyPaused),
    };
  }

  async getPeerProfile(input: {
    userId: string;
    accountId: string;
    peerWxid: string;
  }) {
    const account = await this.accounts.findAccessible(
      input.accountId,
      input.userId,
    );
    const peer = input.peerWxid.trim();
    if (!peer) throw new BadRequestException('缺少 peerWxid');

    const isGroup = peer.includes('@chatroom');
    if (isGroup) {
      return {
        peerWxid: peer,
        isGroup: true,
        profile: {
          userName: peer,
          nickName: '',
          remark: '',
          alias: '',
          displayName: peer,
        },
      };
    }

    try {
      const details = await getContactDetails({
        authKey: account.authKey,
        userNames: [peer],
      });
      const summarized = summarizeContactDetails(details);
      const hit = summarized.find((x) => x.userName === peer) ?? summarized[0];
      return {
        peerWxid: peer,
        isGroup: false,
        profile: hit
          ? {
              ...hit,
              displayName: hit.remark || hit.nickName || hit.alias || peer,
            }
          : {
              userName: peer,
              nickName: '',
              remark: '',
              alias: '',
              displayName: peer,
            },
      };
    } catch (error) {
      this.logger.debug(
        `获取联系人详情失败 peer=${peer}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        peerWxid: peer,
        isGroup: false,
        profile: {
          userName: peer,
          nickName: '',
          remark: '',
          alias: '',
          displayName: peer,
        },
      };
    }
  }
}

function summarizeContactDetails(details: unknown): Array<{
  userName: string;
  nickName: string;
  remark: string;
  alias: string;
}> {
  if (!details || typeof details !== 'object') return [];
  const root = details as Record<string, unknown>;
  const list = root.ContactList ?? root.contactList;
  const arr = Array.isArray(list) ? list : [];
  const out: Array<{
    userName: string;
    nickName: string;
    remark: string;
    alias: string;
  }> = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const userName = pickNestedStr(rec.userName ?? rec.UserName);
    if (!userName) continue;
    out.push({
      userName,
      nickName: pickNestedStr(rec.nickName ?? rec.NickName),
      remark: pickNestedStr(rec.remark ?? rec.Remark),
      alias: pickNestedStr(
        rec.aliasName ?? rec.AliasName ?? rec.alias ?? rec.Alias,
      ),
    });
  }
  return out;
}

function pickNestedStr(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.str === 'string') return obj.str.trim();
    if (typeof obj.Str === 'string') return obj.Str.trim();
  }
  return '';
}
