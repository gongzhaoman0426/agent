import {
  Injectable,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import type { CurrentUserPayload } from './auth.type';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
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

    (request as any).user = this.toCurrentUserPayload(session.user);
    return true;
  }

  private toHeaders(request: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
        continue;
      }

      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    return headers;
  }

  private toCurrentUserPayload(user: Record<string, unknown>): CurrentUserPayload {
    const username =
      (typeof user.username === 'string' && user.username) ||
      (typeof user.name === 'string' && user.name) ||
      (typeof user.email === 'string' && user.email) ||
      '';

    return {
      userId: String(user.id),
      username,
    };
  }
}
