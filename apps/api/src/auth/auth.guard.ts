import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'builder' | 'operator'>) =>
  SetMetadata(ROLES_KEY, roles);

export interface CurrentUserPayload {
  userId: string;
  username: string;
  role: 'builder' | 'operator';
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.authService
      .getSessionByHeaders(this.toHeaders(request))
      .catch(() => null);

    if (!session?.user) {
      throw new UnauthorizedException('未授权访问');
    }

    const user = session.user as Record<string, unknown>;
    const userId = String(user.id);
    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, role: true },
    });
    const role = dbUser?.role === 'operator' ? 'operator' : 'builder';
    const payload: CurrentUserPayload = {
      userId,
      username:
        dbUser?.username ||
        (typeof user.username === 'string' && user.username) ||
        (typeof user.name === 'string' && user.name) ||
        '',
      role,
    };
    (request as Request & { user: CurrentUserPayload }).user = payload;

    const roles = this.reflector.getAllAndOverride<
      Array<'builder' | 'operator'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && roles.length > 0 && !roles.includes(payload.role)) {
      throw new ForbiddenException('当前账号无权访问该功能');
    }

    return true;
  }

  private toHeaders(request: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      } else if (typeof value === 'string') {
        headers.set(key, value);
      }
    }
    return headers;
  }
}
