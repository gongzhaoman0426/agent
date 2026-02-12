import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUserPayload } from './auth.type';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
