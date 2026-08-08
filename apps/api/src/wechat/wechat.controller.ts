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
import { Public } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { WechatAccountService } from './wechat-account.service.js';
import {
  WechatInboundService,
  type ForwardWebhookBody,
} from './wechat-inbound.service.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';

const startLoginSchema = z.object({
  agentId: z.string().min(1),
  proxy: z.string().optional(),
  way: z.string().optional(),
});

const confirmBindSchema = z.object({
  sessionKey: z.string().min(1),
});

const verifyPhoneSchema = z.object({
  sessionKey: z.string().min(1),
  code: z.string().min(1),
});

const updateAccountSchema = z.object({
  agentId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

@Controller('wechat')
export class WechatController {
  constructor(
    private readonly login: WechatLoginService,
    private readonly accounts: WechatAccountService,
    private readonly monitor: WechatMonitorService,
    private readonly inbound: WechatInboundService,
  ) {}

  /** v875 SetForward 回调：无需登录，authKey 即密钥 */
  @Public()
  @Post('webhook/:authKey')
  async webhook(
    @Param('authKey') authKey: string,
    @Body() body: ForwardWebhookBody,
  ) {
    const result = await this.inbound.handleForwardWebhook(authKey, body ?? {});
    if (!result.ok) {
      return { Code: 404, Text: result.reason ?? 'ignored' };
    }
    return { Code: 200, Text: 'ok' };
  }

  @Post('login/start')
  startLogin(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = startLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败：需要 agentId');
    }
    return this.login.startLogin({
      userId: user.userId,
      ...parsed.data,
    });
  }

  @Get('login/status')
  loginStatus(
    @CurrentUser() _user: CurrentUserPayload,
    @Query('sessionKey') sessionKey?: string,
  ) {
    if (!sessionKey?.trim()) {
      throw new BadRequestException('缺少 sessionKey');
    }
    return this.login.pollStatus(sessionKey);
  }

  /** 对应 v875 POST /login/VerifiPhoneCode */
  @Post('login/verify-phone')
  verifyPhone(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = verifyPhoneSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败：需要 sessionKey 与 code');
    }
    return this.login.submitPhoneCode({
      userId: user.userId,
      sessionKey: parsed.data.sessionKey,
      code: parsed.data.code,
    });
  }

  @Post('login/confirm')
  confirmBind(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ) {
    const parsed = confirmBindSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败：需要 sessionKey');
    }
    return this.login.confirmBind({
      userId: user.userId,
      sessionKey: parsed.data.sessionKey,
    });
  }

  @Get('accounts')
  listAccounts(
    @CurrentUser() user: CurrentUserPayload,
    @Query('agentId') agentId?: string,
  ) {
    return this.accounts.list(user.userId, agentId);
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
    if (parsed.data.enabled !== undefined || parsed.data.agentId) {
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
