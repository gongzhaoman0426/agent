import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestContext } from '@mastra/core/request-context';
import {
  readToolkitSettings,
  type ToolkitSettings,
} from '../toolkit/toolkit.types.js';

const TOOLKIT_ID = 'wechat-toolkit';
const DEFAULT_TTL_HOURS = 24;
/** expiresAt 用该值表示永久提权 */
const PERMANENT_EXPIRES_AT = Number.POSITIVE_INFINITY;

type AdminGrant = {
  accountId: string;
  peerWxid: string;
  /** Infinity = 永久 */
  expiresAt: number;
};

@Injectable()
export class WechatAdminService {
  private readonly logger = new Logger(WechatAdminService.name);
  private readonly grants = new Map<string, AdminGrant>();

  getSettings(requestContext: RequestContext): ToolkitSettings {
    return readToolkitSettings(requestContext, TOOLKIT_ID, '微信渠道', []);
  }

  getConfiguredSecret(requestContext: RequestContext): string {
    return this.getSettings(requestContext).adminSecret?.trim() || '';
  }

  /**
   * 消息全文等于管理员密钥时提权，返回系统提示（密钥不回传给模型）。
   * ttlHours: 0 / permanent = 永久；未传默认 24 小时。
   */
  tryElevate(input: {
    accountId: string;
    peerWxid: string;
    message: string;
    adminSecret?: string;
    ttlHours?: number | string;
  }): string | null {
    const secret = input.adminSecret?.trim() || '';
    const message = input.message.trim();
    if (!secret || !message || !safeEqual(secret, message)) {
      return null;
    }
    const permanent = isPermanentTtl(input.ttlHours);
    this.grant(input.accountId, input.peerWxid, input.ttlHours);
    this.logger.log(
      `管理员已提权 account=${input.accountId} peer=${input.peerWxid} ttl=${
        permanent ? 'permanent' : `${normalizeTtlHours(input.ttlHours)}h`
      }`,
    );
    if (permanent) {
      return (
        '[系统] 管理员身份已确认（永久有效，进程重启前一直有效）。' +
        '此后可使用发朋友圈、通过好友、备注、拉群、群公告、查通讯录等管理员工具。'
      );
    }
    const hours = normalizeTtlHours(input.ttlHours);
    return (
      `[系统] 管理员身份已确认，约 ${hours} 小时内有效。` +
      `此后可使用发朋友圈、通过好友、备注、拉群、群公告、查通讯录等管理员工具。`
    );
  }

  elevateFromRequestContext(input: {
    requestContext: RequestContext;
    accountId: string;
    peerWxid: string;
    secret: string;
  }) {
    const settings = this.getSettings(input.requestContext);
    const expected = settings.adminSecret?.trim() || '';
    if (!expected) {
      throw new Error(
        '未配置管理员密钥：请在「插件工具 → 微信渠道」中填写 adminSecret',
      );
    }
    if (!safeEqual(expected, input.secret.trim())) {
      throw new Error('管理员密钥不正确');
    }
    const ttlRaw = settings.adminTtlHours;
    const permanent = isPermanentTtl(ttlRaw);
    this.grant(input.accountId, input.peerWxid, ttlRaw);
    return {
      success: true as const,
      permanent,
      expiresInHours: permanent ? null : normalizeTtlHours(ttlRaw),
    };
  }

  grant(
    accountId: string,
    peerWxid: string,
    ttlHours: number | string | undefined = DEFAULT_TTL_HOURS,
  ) {
    const expiresAt = isPermanentTtl(ttlHours)
      ? PERMANENT_EXPIRES_AT
      : Date.now() + normalizeTtlHours(ttlHours) * 3_600_000;
    this.grants.set(this.key(accountId, peerWxid), {
      accountId,
      peerWxid,
      expiresAt,
    });
  }

  isAdmin(accountId: string, peerWxid: string): boolean {
    const grant = this.grants.get(this.key(accountId, peerWxid));
    if (!grant) return false;
    if (grant.expiresAt !== PERMANENT_EXPIRES_AT && grant.expiresAt <= Date.now()) {
      this.grants.delete(this.key(accountId, peerWxid));
      return false;
    }
    return true;
  }

  requireAdmin(accountId: string, peerWxid: string) {
    if (!this.isAdmin(accountId, peerWxid)) {
      throw new Error(
        '需要管理员权限：请先在私聊中发送工具包配置的管理员密钥完成认证',
      );
    }
  }

  listActiveAdminPeers(accountId: string): string[] {
    const now = Date.now();
    const peers: string[] = [];
    for (const [key, grant] of this.grants) {
      if (!key.startsWith(`${accountId}:`)) continue;
      if (
        grant.expiresAt !== PERMANENT_EXPIRES_AT &&
        grant.expiresAt <= now
      ) {
        this.grants.delete(key);
        continue;
      }
      peers.push(grant.peerWxid);
    }
    return peers;
  }

  private key(accountId: string, peerWxid: string) {
    return `${accountId}:${peerWxid}`;
  }
}

/** 0 / permanent / forever / 永久 → 永久提权 */
export function isPermanentTtl(raw: number | string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'number') return raw === 0;
  const s = String(raw).trim().toLowerCase();
  if (!s) return false;
  if (['0', 'permanent', 'forever', '永久', 'perm'].includes(s)) return true;
  return Number(s) === 0;
}

/** 空/非法 → 默认 24；永久不应调用本函数算小时数 */
export function normalizeTtlHours(raw: number | string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_TTL_HOURS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TTL_HOURS;
  if (n === 0) return 0;
  return Math.min(Math.max(Math.floor(n), 1), 168 * 4);
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
