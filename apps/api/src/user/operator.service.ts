import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async requireBuilder(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'builder') {
      throw new ForbiddenException('仅一类账号（搭建者）可管理运营账号');
    }
    return user;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role === 'operator' ? 'operator' : 'builder',
      createdById: user.createdById,
    };
  }

  async listOperators(creatorId: string) {
    await this.requireBuilder(creatorId);
    const rows = await this.prisma.user.findMany({
      where: { role: 'operator', createdById: creatorId },
      orderBy: { createdAt: 'desc' },
      include: {
        wechatOperatorGrants: {
          select: { accountId: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      role: 'operator' as const,
      accountIds: row.wechatOperatorGrants.map((g) => g.accountId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createOperator(input: {
    creatorId: string;
    username: string;
    password: string;
    name?: string;
    accountIds: string[];
  }) {
    await this.requireBuilder(input.creatorId);
    const username = input.username.trim();
    const password = input.password;
    if (username.length < 2) {
      throw new BadRequestException('用户名至少 2 位');
    }
    if (password.length < 6) {
      throw new BadRequestException('密码至少 6 位');
    }

    const exists = await this.prisma.user.findFirst({
      where: { username },
    });
    if (exists) {
      throw new BadRequestException('用户名已存在');
    }

    const accountIds = await this.assertOwnedAccountIds(
      input.creatorId,
      input.accountIds,
    );

    const name = (input.name?.trim() || username).slice(0, 64);
    // 走 better-auth 官方注册，保证密码哈希与登录校验一致
    const created = await this.authService.createCredentialUser({
      username,
      password,
      name,
    });

    await this.prisma.user.update({
      where: { id: created.id },
      data: {
        role: 'operator',
        createdById: input.creatorId,
        displayUsername: username,
      },
    });

    if (accountIds.length > 0) {
      await this.prisma.wechatAccountOperator.createMany({
        data: accountIds.map((accountId) => ({
          accountId,
          userId: created.id,
        })),
      });
    }

    return {
      id: created.id,
      name: created.name,
      username: created.username,
      role: 'operator' as const,
      accountIds,
    };
  }

  async updateOperator(input: {
    creatorId: string;
    operatorId: string;
    accountIds?: string[];
    password?: string;
    name?: string;
  }) {
    await this.requireBuilder(input.creatorId);
    const operator = await this.prisma.user.findFirst({
      where: {
        id: input.operatorId,
        role: 'operator',
        createdById: input.creatorId,
      },
    });
    if (!operator) {
      throw new NotFoundException('运营账号不存在');
    }

    if (input.name?.trim()) {
      await this.prisma.user.update({
        where: { id: operator.id },
        data: { name: input.name.trim().slice(0, 64) },
      });
    }

    if (input.password) {
      if (input.password.length < 6) {
        throw new BadRequestException('密码至少 6 位');
      }
      const passwordHash = await this.authService.hashPassword(input.password);
      const updated = await this.prisma.account.updateMany({
        where: { userId: operator.id, providerId: 'credential' },
        data: { password: passwordHash },
      });
      if (updated.count === 0) {
        throw new BadRequestException('该账号缺少登录凭证，请删除后重建');
      }
    }

    let accountIds: string[] | undefined;
    if (input.accountIds) {
      accountIds = await this.assertOwnedAccountIds(
        input.creatorId,
        input.accountIds,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.wechatAccountOperator.deleteMany({
          where: { userId: operator.id },
        });
        if (accountIds!.length > 0) {
          await tx.wechatAccountOperator.createMany({
            data: accountIds!.map((accountId) => ({
              accountId,
              userId: operator.id,
            })),
          });
        }
      });
    } else {
      const grants = await this.prisma.wechatAccountOperator.findMany({
        where: { userId: operator.id },
        select: { accountId: true },
      });
      accountIds = grants.map((g) => g.accountId);
    }

    const refreshed = await this.prisma.user.findUniqueOrThrow({
      where: { id: operator.id },
    });
    return {
      id: refreshed.id,
      name: refreshed.name,
      username: refreshed.username,
      role: 'operator' as const,
      accountIds,
    };
  }

  async removeOperator(creatorId: string, operatorId: string) {
    await this.requireBuilder(creatorId);
    const operator = await this.prisma.user.findFirst({
      where: {
        id: operatorId,
        role: 'operator',
        createdById: creatorId,
      },
    });
    if (!operator) {
      throw new NotFoundException('运营账号不存在');
    }
    await this.prisma.user.delete({ where: { id: operator.id } });
    return { success: true };
  }

  private async assertOwnedAccountIds(ownerId: string, accountIds: string[]) {
    const unique = [
      ...new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (unique.length === 0) return [];
    const owned = await this.prisma.wechatAccount.findMany({
      where: { userId: ownerId, id: { in: unique } },
      select: { id: true },
    });
    if (owned.length !== unique.length) {
      throw new BadRequestException('只能勾选自己绑定的微信号');
    }
    return unique;
  }
}
