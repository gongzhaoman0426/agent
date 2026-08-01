import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';

const confirmBindSchema = z.object({
  defaultAgentId: z.string().min(1),
  accountId: z.string().min(1),
  token: z.string().min(1),
  baseUrl: z.string().optional(),
});

const verifyCodeSchema = z.object({
  sessionKey: z.string().min(1),
  code: z.string().min(1),
});

const updateAccountSchema = z.object({
  defaultAgentId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

@Controller('wechat')
export class WechatController {
  constructor(
    private readonly login: WechatLoginService,
    private readonly accounts: WechatAccountService,
    private readonly monitor: WechatMonitorService,
  ) {}

  @Post('login/start')
  startLogin(@CurrentUser() _user: CurrentUserPayload) {
    return this.login.startLogin();
  }

  @Get('login/status')
  loginStatus(
    @CurrentUser() _user: CurrentUserPayload,
    @Query('sessionKey') sessionKey?: string,
  ) {
    return this.login.pollStatus(sessionKey ?? '');
  }

  @Post('login/verify-code')
  verifyCode(
    @CurrentUser() _user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = verifyCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败');
    }
    return this.login.submitVerifyCode(
      parsed.data.sessionKey,
      parsed.data.code,
    );
  }

  @Post('login/confirm')
  confirmBind(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = confirmBindSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        `参数校验失败: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return this.login.confirmBind({
      userId: user.userId,
      ...parsed.data,
    });
  }

  @Get('accounts')
  listAccounts(@CurrentUser() user: CurrentUserPayload) {
    return this.accounts.list(user.userId);
  }

  @Patch('accounts/:id')
  async updateAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败');
    }
    const updated = await this.accounts.update(id, user.userId, parsed.data);
    if (parsed.data.enabled !== undefined) {
      await this.monitor.reload();
    }
    return updated;
  }

  @Delete('accounts/:id')
  async removeAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const result = await this.accounts.remove(id, user.userId);
    await this.monitor.reload();
    return result;
  }
}
