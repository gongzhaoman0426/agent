import { BadRequestException, Injectable } from '@nestjs/common';
import {
  pollWeixinQrLogin,
  startWeixinQrLogin,
  submitWeixinVerifyCode,
} from './ilink/login-qr.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';

@Injectable()
export class WechatLoginService {
  constructor(
    private readonly accounts: WechatAccountService,
    private readonly monitor: WechatMonitorService,
  ) {}

  startLogin() {
    return startWeixinQrLogin();
  }

  pollStatus(sessionKey: string) {
    if (!sessionKey?.trim()) {
      throw new BadRequestException('缺少 sessionKey');
    }
    return pollWeixinQrLogin(sessionKey.trim());
  }

  submitVerifyCode(sessionKey: string, code: string) {
    if (!sessionKey?.trim() || !code?.trim()) {
      throw new BadRequestException('缺少 sessionKey 或配对码');
    }
    return submitWeixinVerifyCode(sessionKey.trim(), code);
  }

  /**
   * 扫码成功后落库并拉起监控。
   * 前端在 status=confirmed 时带上 defaultAgentId 调用本接口。
   */
  async confirmBind(input: {
    userId: string;
    defaultAgentId: string;
    accountId: string;
    token: string;
    baseUrl?: string;
  }) {
    if (!input.accountId?.trim() || !input.token?.trim()) {
      throw new BadRequestException('缺少微信凭证');
    }
    const account = await this.accounts.upsertFromLogin({
      userId: input.userId,
      accountId: input.accountId.trim(),
      token: input.token.trim(),
      baseUrl: input.baseUrl,
      defaultAgentId: input.defaultAgentId,
    });
    await this.monitor.reload();
    return account;
  }
}
