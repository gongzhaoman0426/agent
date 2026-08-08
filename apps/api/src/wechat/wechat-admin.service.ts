import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestContext } from '@mastra/core/request-context';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  readToolkitSettings,
  type ToolkitSettings,
} from '../toolkit/toolkit.types.js';

const TOOLKIT_ID = 'wechat-toolkit';
const DEFAULT_TTL_HOURS = 24;
/** 内存缓存用 Infinity 表示永久；DB 中 expiresAt = null */
const PERMANENT_EXPIRES_AT = Number.POSITIVE_INFINITY;

type AdminGrant = {
  accountId: string;
  peerWxid: string;
  /** Infinity = 永久 */
  expiresAt: number;
};

@Injectable()
export class WechatAdminService implements OnModuleInit {
  private readonly logger = new Logger(WechatAdminService.name);
  private readonly grants = new Map<string, AdminGrant>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const now = new Date();
    const rows = await this.prisma.wechatAdminGrant.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    for (const row of rows) {
      this.grants.set(this.key(row.accountId, row.peerWxid), {
        accountId: row.accountId,
        peerWxid: row.peerWxid,
        expiresAt: row.expiresAt
          ? row.expiresAt.getTime()
          : PERMANENT_EXPIRES_AT,
      });
    }
    if (rows.length > 0) {
      this.logger.log(`已从数据库恢复 ${rows.length} 条管理员提权`);
    }
  }

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
  async tryElevate(input: {
    accountId: string;
    peerWxid: string;
    message: string;
    adminSecret?: string;
    ttlHours?: number | string;
  }): Promise<string | null> {
    const secret = input.adminSecret?.trim() || '';
    const message = input.message.trim();
    if (!secret || !message || !safeEqual(secret, message)) {
      return null;
    }
    const permanent = isPermanentTtl(input.ttlHours);
    await this.grant(input.accountId, input.peerWxid, input.ttlHours);
    this.logger.log(
      `管理员已提权 account=${input.accountId} peer=${input.peerWxid} ttl=${
        permanent ? 'permanent' : `${normalizeTtlHours(input.ttlHours)}h`
      }`,
    );
    if (permanent) {
      return (
        '[系统] 管理员身份已确认（永久有效，直至重新配置密钥或撤销）。' +
        '此后可使用发朋友圈、通过好友、备注、拉群、群公告、查通讯录等管理员工具。'
      );
    }
    const hours = normalizeTtlHours(input.ttlHours);
    return (
      `[系统] 管理员身份已确认，约 ${hours} 小时内有效。` +
      `此后可使用发朋友圈、通过好友、备注、拉群、群公告、查通讯录等管理员工具。`
    );
  }

  async elevateFromRequestContext(input: {
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
    await this.grant(input.accountId, input.peerWxid, ttlRaw);
    return {
      success: true as const,
      permanent,
      expiresInHours: permanent ? null : normalizeTtlHours(ttlRaw),
    };
  }

  async grant(
    accountId: string,
    peerWxid: string,
    ttlHours: number | string | undefined = DEFAULT_TTL_HOURS,
  ) {
    const permanent = isPermanentTtl(ttlHours);
    const expiresAtMs = permanent
      ? PERMANENT_EXPIRES_AT
      : Date.now() + normalizeTtlHours(ttlHours) * 3_600_000;
    const expiresAt = permanent ? null : new Date(expiresAtMs);

    this.grants.set(this.key(accountId, peerWxid), {
      accountId,
      peerWxid,
      expiresAt: expiresAtMs,
    });

    await this.prisma.wechatAdminGrant.upsert({
      where: {
        accountId_peerWxid: { accountId, peerWxid },
      },
      create: { accountId, peerWxid, expiresAt },
      update: { expiresAt },
    });
  }

  async isAdmin(accountId: string, peerWxid: string): Promise<boolean> {
    const k = this.key(accountId, peerWxid);
    let grant = this.grants.get(k);

    if (!grant) {
      const row = await this.prisma.wechatAdminGrant.findUnique({
        where: { accountId_peerWxid: { accountId, peerWxid } },
      });
      if (!row) return false;
      grant = {
        accountId,
        peerWxid,
        expiresAt: row.expiresAt
          ? row.expiresAt.getTime()
          : PERMANENT_EXPIRES_AT,
      };
      this.grants.set(k, grant);
    }

    if (
      grant.expiresAt !== PERMANENT_EXPIRES_AT &&
      grant.expiresAt <= Date.now()
    ) {
      this.grants.delete(k);
      await this.prisma.wechatAdminGrant
        .delete({
          where: { accountId_peerWxid: { accountId, peerWxid } },
        })
        .catch(() => undefined);
      return false;
    }
    return true;
  }

  async requireAdmin(accountId: string, peerWxid: string) {
    if (!(await this.isAdmin(accountId, peerWxid))) {
      throw new Error(
        '需要管理员权限：请先在私聊中发送工具包配置的管理员密钥完成认证',
      );
    }
  }

  async listActiveAdminPeers(accountId: string): Promise<string[]> {
    const now = Date.now();
    const peers: string[] = [];

    // 先清内存过期
    for (const [key, grant] of this.grants) {
      if (!key.startsWith(`${accountId}:`)) continue;
      if (
        grant.expiresAt !== PERMANENT_EXPIRES_AT &&
        grant.expiresAt <= now
      ) {
        this.grants.delete(key);
      }
    }

    const rows = await this.prisma.wechatAdminGrant.findMany({
      where: {
        accountId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
    });

    for (const row of rows) {
      this.grants.set(this.key(row.accountId, row.peerWxid), {
        accountId: row.accountId,
        peerWxid: row.peerWxid,
        expiresAt: row.expiresAt
          ? row.expiresAt.getTime()
          : PERMANENT_EXPIRES_AT,
      });
      peers.push(row.peerWxid);
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
