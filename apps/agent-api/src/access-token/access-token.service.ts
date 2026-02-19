import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class CreateAccessTokenDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async create(userId: string, dto: CreateAccessTokenDto) {
    const rawToken = `sk-${randomBytes(48).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);

    const record = await this.prisma.accessToken.create({
      data: {
        name: dto.name,
        tokenHash,
        userId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return { id: record.id, name: record.name, token: rawToken, createdAt: record.createdAt };
  }

  async findAllByUser(userId: string) {
    return this.prisma.accessToken.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, userId: string) {
    await this.prisma.accessToken.deleteMany({ where: { id, userId } });
  }

  async validateToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.accessToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, name: true, username: true, email: true } } },
    });

    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Fire-and-forget lastUsedAt update
    this.prisma.accessToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return record.user;
  }
}
