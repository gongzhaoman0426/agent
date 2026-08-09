import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, username } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

/** 允许中文/字母/数字/下划线/点，至少 2 位 */
function usernameValidator(value: string) {
  return /^[\p{L}\p{N}._]+$/u.test(value);
}

/** 用具体调用签名推导实例类型，避免 betterAuth 泛型退化为 Auth<BetterAuthOptions> */
function buildBetterAuth(params: {
  prisma: PrismaService;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
}) {
  return betterAuth({
    baseURL: params.baseURL,
    basePath: '/api/auth',
    secret: params.secret,
    database: prismaAdapter(params.prisma, { provider: 'postgresql' }),
    trustedOrigins: params.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      password: {
        hash: async (password) => bcrypt.hash(password, 10),
        verify: async ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    plugins: [
      username({
        usernameNormalization: false,
        minUsernameLength: 2,
        maxUsernameLength: 30,
        usernameValidator,
      }),
      bearer(),
    ],
  });
}

type AuthInstance = ReturnType<typeof buildBetterAuth>;
type NodeAuthHandler = (req: Request, res: Response) => Promise<unknown>;

@Injectable()
export class AuthService implements OnModuleInit {
  private auth: AuthInstance;
  private nodeHandler: NodeAuthHandler;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.auth = buildBetterAuth({
      prisma: this.prisma,
      baseURL:
        this.configService.get<string>('BETTER_AUTH_URL') ||
        `http://localhost:${process.env.PORT || 3003}`,
      secret:
        this.configService.get<string>('BETTER_AUTH_SECRET') ||
        'agent-next-dev-secret',
      trustedOrigins: this.getTrustedOrigins(),
    });
    this.nodeHandler = toNodeHandler(this.auth) as NodeAuthHandler;
  }

  getNodeHandler(): NodeAuthHandler {
    return this.nodeHandler;
  }

  async getSessionByHeaders(headers: Headers) {
    return this.auth.api.getSession({ headers });
  }

  /**
   * 通过 better-auth 官方注册流程创建账号（密码哈希/Account 行与登录一致）。
   * 邮箱用随机 ASCII，登录仍走用户名。
   */
  async createCredentialUser(input: {
    username: string;
    password: string;
    name: string;
  }): Promise<{ id: string; username: string; name: string; email: string }> {
    const username = input.username.trim();
    if (!usernameValidator(username)) {
      throw new BadRequestException(
        '用户名仅支持中文、字母、数字、点和下划线',
      );
    }
    if (username.length < 2 || username.length > 30) {
      throw new BadRequestException('用户名长度需为 2–30 位');
    }

    const email = `u_${randomBytes(8).toString('hex')}@agent.local`;
    try {
      const result = await this.auth.api.signUpEmail({
        body: {
          email,
          password: input.password,
          name: input.name,
          username,
        },
      });
      const user = result.user as {
        id: string;
        name: string;
        email: string;
        username?: string | null;
      };
      return {
        id: user.id,
        username: user.username || username,
        name: user.name,
        email: user.email,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (/already|taken|exists/i.test(message)) {
        throw new BadRequestException('用户名已存在');
      }
      throw new BadRequestException(
        message.includes(' ')
          ? `创建账号失败：${message}`
          : '创建账号失败，请检查用户名与密码',
      );
    }
  }

  async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  private getTrustedOrigins() {
    const origins = this.configService
      .get<string>('BETTER_AUTH_TRUSTED_ORIGINS')
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return origins && origins.length > 0 ? origins : ['http://localhost:5180'];
  }
}
