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
import { Public, Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/auth.guard.js';
import { WechatAccountService } from './wechat-account.service.js';
import {
  WechatInboundService,
  type ForwardWebhookBody,
} from './wechat-inbound.service.js';
import { WechatLoginService } from './wechat-login.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';
import { WechatInboxService } from './wechat-inbox.service.js';

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

const autoReplySchema = z.object({
  paused: z.boolean(),
});

const sendInboxMessageSchema = z.object({
  peerWxid: z.string().min(1),
  text: z.string().min(1),
  splitSegments: z.boolean().optional(),
});


@Controller('wechat')
export class WechatController {
  constructor(
    private readonly login: WechatLoginService,
    private readonly accounts: WechatAccountService,
    private readonly monitor: WechatMonitorService,
    private readonly inbound: WechatInboundService,
    private readonly inbox: WechatInboxService,
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

  @Roles('builder')
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

  @Roles('builder')
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
  @Roles('builder')
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

  @Roles('builder')
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

  @Roles('builder')
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

  @Roles('builder')
  @Delete('accounts/:id')
  async removeAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const result = await this.accounts.remove(id, user.userId);
    await this.monitor.reload();
    return result;
  }

  /** 运营收件箱：某微信号下的微信会话列表 */
  @Get('accounts/:id/inbox')
  listInbox(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.inbox.listConversations(user.userId, id);
  }

  /** 运营收件箱：会话消息 */
  @Get('accounts/:id/inbox/messages')
  getInboxMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('peerWxid') peerWxid?: string,
  ) {
    if (!peerWxid?.trim()) {
      throw new BadRequestException('缺少 peerWxid');
    }
    return this.inbox.getConversation(user.userId, id, peerWxid);
  }

  /** 运营收件箱：人工回复（不走 Agent） */
  @Post('accounts/:id/inbox/messages')
  sendInboxMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = sendInboxMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败：需要 peerWxid 与 text');
    }
    return this.inbox.sendManualMessage({
      userId: user.userId,
      accountId: id,
      ...parsed.data,
    });
  }

  /** 开关 AI 自动回复（整号） */
  @Post('accounts/:id/auto-reply')
  setAutoReply(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = autoReplySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('参数校验失败：需要 paused');
    }
    return this.inbox.setAutoReply({
      userId: user.userId,
      accountId: id,
      paused: parsed.data.paused,
    });
  }

  /** 当前会话对端资料（好友详情；群暂返回 ID） */
  @Get('accounts/:id/peers/profile')
  getPeerProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('peerWxid') peerWxid?: string,
  ) {
    if (!peerWxid?.trim()) {
      throw new BadRequestException('缺少 peerWxid');
    }
    return this.inbox.getPeerProfile({
      userId: user.userId,
      accountId: id,
      peerWxid,
    });
  }
}
