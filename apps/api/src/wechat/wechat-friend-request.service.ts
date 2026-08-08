import { Injectable, Logger } from '@nestjs/common';
import { agreeAddFriend } from './pad/friend.js';
import { WechatAccountService } from './wechat-account.service.js';

export type PendingFriendRequest = {
  accountId: string;
  fromWxid: string;
  nickName: string;
  v3: string;
  v4: string;
  scene: number;
  content: string;
  createdAt: number;
};

/** 好友验证消息 */
const VERIFY_MSG_TYPE = 37;

@Injectable()
export class WechatFriendRequestService {
  private readonly logger = new Logger(WechatFriendRequestService.name);
  /** key = accountId → 最近若干条待通过请求（按 fromWxid 覆盖） */
  private readonly pendingByAccount = new Map<
    string,
    Map<string, PendingFriendRequest>
  >();

  constructor(private readonly accounts: WechatAccountService) {}

  rememberFromVerifyMsg(input: {
    accountId: string;
    msgType: number;
    content: string;
  }): { prompt: string; pending: PendingFriendRequest } | null {
    if (input.msgType !== VERIFY_MSG_TYPE) return null;
    const parsed = parseFriendVerifyMsg(input.content);
    if (!parsed) return null;

    const pending: PendingFriendRequest = {
      accountId: input.accountId,
      fromWxid: parsed.fromWxid,
      nickName: parsed.nickName,
      v3: parsed.v3,
      v4: parsed.v4,
      scene: parsed.scene,
      content: parsed.content,
      createdAt: Date.now(),
    };

    let map = this.pendingByAccount.get(input.accountId);
    if (!map) {
      map = new Map();
      this.pendingByAccount.set(input.accountId, map);
    }
    map.set(pending.fromWxid || pending.v3, pending);
    this.logger.log(
      `好友请求已缓存 account=${input.accountId} from=${pending.fromWxid || pending.nickName}`,
    );

    return {
      pending,
      prompt:
        `[好友请求] ${pending.nickName || pending.fromWxid || '未知用户'} 请求添加好友` +
        (pending.content ? `，验证信息：${pending.content}` : '') +
        `。管理员可调用 wechat_agree_friend 通过（可传 fromWxid=${pending.fromWxid || '空'}）。`,
    };
  }

  async agree(input: {
    accountId: string;
    agentId: string;
    fromWxid?: string;
  }) {
    const row = await this.accounts.findById(input.accountId);
    if (!row || row.agentId !== input.agentId) {
      throw new Error('当前会话绑定的微信号无效');
    }

    const map = this.pendingByAccount.get(input.accountId);
    if (!map || map.size === 0) {
      throw new Error('没有待通过的好友请求');
    }

    let pending: PendingFriendRequest | undefined;
    if (input.fromWxid?.trim()) {
      pending = map.get(input.fromWxid.trim());
      if (!pending) {
        for (const item of map.values()) {
          if (item.fromWxid === input.fromWxid.trim()) {
            pending = item;
            break;
          }
        }
      }
    } else if (map.size === 1) {
      pending = [...map.values()][0];
    } else {
      throw new Error(
        `有多条待通过好友请求，请指定 fromWxid。候选：${[...map.keys()].join('、')}`,
      );
    }

    if (!pending) {
      throw new Error('未找到对应的好友请求');
    }

    await agreeAddFriend({
      authKey: row.authKey,
      v3: pending.v3,
      v4: pending.v4,
      scene: pending.scene,
    });

    map.delete(pending.fromWxid || pending.v3);
    return {
      success: true as const,
      fromWxid: pending.fromWxid,
      nickName: pending.nickName,
    };
  }
}

function parseFriendVerifyMsg(content: string): {
  fromWxid: string;
  nickName: string;
  v3: string;
  v4: string;
  scene: number;
  content: string;
} | null {
  const xml = content?.trim();
  if (!xml) return null;

  // AgreeAdd 的 V3 必须是 encryptusername（v3_…@stranger），不能用 fromusername(wxid)
  const v3 =
    pickAttr(xml, 'encryptusername') ||
    pickXmlTag(xml, 'encryptusername');
  const v4 = pickAttr(xml, 'ticket') || pickXmlTag(xml, 'ticket');
  if (!v3 || !v4) return null;

  const scene = Number(pickAttr(xml, 'scene') || pickXmlTag(xml, 'scene') || 3);
  const nickName =
    pickAttr(xml, 'fromnickname') ||
    pickAttr(xml, 'nickname') ||
    pickXmlTag(xml, 'nickname') ||
    '';
  const fromWxid =
    pickAttr(xml, 'fromusername') || pickXmlTag(xml, 'fromusername') || '';
  const verifyContent =
    pickAttr(xml, 'content') || pickXmlTag(xml, 'content') || '';

  return {
    fromWxid,
    nickName,
    v3,
    v4,
    scene: Number.isFinite(scene) ? scene : 3,
    content: verifyContent,
  };
}

function pickAttr(xml: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const match = xml.match(re);
  return match?.[1]?.trim() || '';
}

function pickXmlTag(xml: string, tag: string): string {
  const cdata = xml.match(
    new RegExp(
      `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
      'i',
    ),
  );
  if (cdata?.[1] != null) return cdata[1].trim();
  const plain = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'),
  );
  return plain?.[1]?.trim() || '';
}
