import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, username } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

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
    plugins: [username({ usernameNormalization: false }), bearer()],
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

  private getTrustedOrigins() {
    const origins = this.configService
      .get<string>('BETTER_AUTH_TRUSTED_ORIGINS')
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return origins && origins.length > 0 ? origins : ['http://localhost:5180'];
  }
}
