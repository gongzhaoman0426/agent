import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WechatAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async list(userId: string, agentId?: string) {
    const rows = await this.prisma.wechatAccount.findMany({
      where: {
        userId,
        ...(agentId ? { agentId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async findEnabled() {
    return this.prisma.wechatAccount.findMany({
      where: { enabled: true },
    });
  }

  async findById(id: string) {
    return this.prisma.wechatAccount.findUnique({ where: { id } });
  }

  async findByAuthKey(authKey: string) {
    return this.prisma.wechatAccount.findUnique({ where: { authKey } });
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

  async createFromLogin(input: {
    userId: string;
    agentId: string;
    authKey: string;
    wxid: string;
    nickname?: string;
    proxy?: string;
    deviceWay?: string;
  }) {
    await this.agentService.findOwned(input.agentId, input.userId);

    const authKey = input.authKey.trim();
    const wxid = input.wxid.trim();
    if (!authKey || !wxid) {
      throw new BadRequestException('缺少 authKey 或 wxid');
    }

    const existingWxid = await this.prisma.wechatAccount.findUnique({
      where: { wxid },
    });
    if (existingWxid && existingWxid.userId !== input.userId) {
      throw new BadRequestException('该微信号已被其他用户绑定');
    }

    const row = await this.prisma.wechatAccount.upsert({
      where: { wxid },
      create: {
        userId: input.userId,
        agentId: input.agentId,
        authKey,
        wxid,
        nickname: input.nickname?.trim() || '',
        proxy: input.proxy?.trim() || '',
        deviceWay: input.deviceWay?.trim() || '',
        enabled: true,
      },
      update: {
        userId: input.userId,
        agentId: input.agentId,
        authKey,
        nickname: input.nickname?.trim() || '',
        proxy: input.proxy?.trim() || '',
        deviceWay: input.deviceWay?.trim() || '',
        enabled: true,
      },
    });
    return this.toPublic(row);
  }

  async update(
    id: string,
    userId: string,
    patch: { agentId?: string; enabled?: boolean },
  ) {
    await this.findOwned(id, userId);
    if (patch.agentId) {
      await this.agentService.findOwned(patch.agentId, userId);
    }
    const row = await this.prisma.wechatAccount.update({
      where: { id },
      data: {
        ...(patch.agentId ? { agentId: patch.agentId } : {}),
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

  private toPublic(row: {
    id: string;
    userId: string;
    agentId: string;
    wxid: string;
    nickname: string;
    proxy: string;
    deviceWay: string;
    enabled: boolean;
    autoReplyPaused?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      agentId: row.agentId,
      wxid: row.wxid,
      nickname: row.nickname,
      proxy: row.proxy,
      deviceWay: row.deviceWay,
      enabled: row.enabled,
      autoReplyPaused: Boolean(row.autoReplyPaused),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
