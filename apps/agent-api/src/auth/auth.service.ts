import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type BetterAuthInstance = any;
type NodeAuthHandler = (req: Request, res: Response) => Promise<unknown> | unknown;

@Injectable()
export class AuthService {
  private auth: BetterAuthInstance | null = null;
  private authPromise: Promise<BetterAuthInstance> | null = null;
  private nodeHandler: NodeAuthHandler | null = null;
  private nodeHandlerPromise: Promise<NodeAuthHandler> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getSessionByHeaders(headers: Headers) {
    const auth = await this.getAuth();
    return auth.api.getSession({ headers });
  }

  async getNodeHandler(): Promise<NodeAuthHandler> {
    if (this.nodeHandler) {
      return this.nodeHandler;
    }

    if (!this.nodeHandlerPromise) {
      this.nodeHandlerPromise = (async () => {
        const [{ toNodeHandler }, auth] = await Promise.all([
          import('better-auth/node'),
          this.getAuth(),
        ]);
        return toNodeHandler(auth) as NodeAuthHandler;
      })();
    }

    this.nodeHandler = await this.nodeHandlerPromise;
    return this.nodeHandler;
  }

  private async getAuth(): Promise<BetterAuthInstance> {
    if (this.auth) {
      return this.auth;
    }

    if (!this.authPromise) {
      this.authPromise = this.buildAuth();
    }

    this.auth = await this.authPromise;
    return this.auth;
  }

  private async buildAuth(): Promise<BetterAuthInstance> {
    const [{ betterAuth }, { prismaAdapter }, { bearer, username }] =
      await Promise.all([
        import('better-auth'),
        import('better-auth/adapters/prisma'),
        import('better-auth/plugins'),
      ]);

    return betterAuth({
      baseURL:
        this.configService.get<string>('BETTER_AUTH_URL') ||
        `http://localhost:${process.env.PORT || 3001}`,
      basePath: '/api/auth',
      secret:
        this.configService.get<string>('BETTER_AUTH_SECRET') ||
        this.configService.get<string>('JWT_SECRET') ||
        'default-better-auth-secret',
      database: prismaAdapter(this.prisma, {
        provider: 'postgresql',
      }),
      trustedOrigins: this.getTrustedOrigins(),
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
        }),
        bearer(),
      ],
    });
  }

  private getTrustedOrigins() {
    const origins = this.configService
      .get<string>('BETTER_AUTH_TRUSTED_ORIGINS')
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return origins && origins.length > 0 ? origins : ['http://localhost:5179'];
  }
}
