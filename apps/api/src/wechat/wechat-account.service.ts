import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService } from '../agent/agent.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_ILINK_BASE_URL } from './ilink/api.js';

export type PeerContextEntry = {
  contextToken?: string;
};

export type PeerContextMap = Record<string, PeerContextEntry>;

@Injectable()
export class WechatAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.wechatAccount.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async findEnabled() {
    return this.prisma.wechatAccount.findMany({
      where: { enabled: true },
    });
  }

  async findByAccountId(accountId: string) {
    return this.prisma.wechatAccount.findUnique({ where: { accountId } });
  }

  async findById(id: string) {
    return this.prisma.wechatAccount.findUnique({ where: { id } });
  }

  async findOwned(id: string, userId: string) {
    const row = await this.prisma.wechatAccount.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('微信账号不存在');
    }
    return row;
  }

  async upsertFromLogin(input: {
    userId: string;
    accountId: string;
    token: string;
    baseUrl?: string;
    defaultAgentId: string;
  }) {
    if (!input.token.trim()) {
      throw new BadRequestException('缺少 bot token');
    }
    await this.agentService.findOwned(input.defaultAgentId, input.userId);

    const row = await this.prisma.wechatAccount.upsert({
      where: { accountId: input.accountId },
      create: {
        userId: input.userId,
        accountId: input.accountId,
        token: input.token.trim(),
        baseUrl: input.baseUrl?.trim() || DEFAULT_ILINK_BASE_URL,
        defaultAgentId: input.defaultAgentId,
        enabled: true,
      },
      update: {
        userId: input.userId,
        token: input.token.trim(),
        baseUrl: input.baseUrl?.trim() || DEFAULT_ILINK_BASE_URL,
        defaultAgentId: input.defaultAgentId,
        enabled: true,
      },
    });
    return this.toPublic(row);
  }

  async update(
    id: string,
    userId: string,
    patch: { defaultAgentId?: string; enabled?: boolean },
  ) {
    await this.findOwned(id, userId);
    if (patch.defaultAgentId) {
      await this.agentService.findOwned(patch.defaultAgentId, userId);
    }
    const row = await this.prisma.wechatAccount.update({
      where: { id },
      data: {
        ...(patch.defaultAgentId
          ? { defaultAgentId: patch.defaultAgentId }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
    });
    return this.toPublic(row);
  }

  async remove(id: string, userId: string) {
    await this.findOwned(id, userId);
    await this.prisma.wechatAccount.delete({ where: { id } });
    return { success: true };
  }

  getPeerContext(row: { peerContext: unknown }): PeerContextMap {
    const raw = row.peerContext;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as PeerContextMap;
  }

  async setPeerContextToken(
    accountDbId: string,
    peerUserId: string,
    contextToken: string | undefined,
  ) {
    const row = await this.prisma.wechatAccount.findUnique({
      where: { id: accountDbId },
    });
    if (!row) return;

    const map = this.getPeerContext(row);
    if (contextToken) {
      map[peerUserId] = { contextToken };
    } else {
      delete map[peerUserId];
    }

    await this.prisma.wechatAccount.update({
      where: { id: accountDbId },
      data: { peerContext: map as Prisma.InputJsonValue },
    });
  }

  private toPublic(row: {
    id: string;
    userId: string;
    accountId: string;
    baseUrl: string;
    defaultAgentId: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      baseUrl: row.baseUrl,
      defaultAgentId: row.defaultAgentId,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
