import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, username } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly auth: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.auth = betterAuth({
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

  get betterAuth() {
    return this.auth;
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

    return origins && origins.length > 0 ? origins : ['http://localhost:5179'];
  }
}
