import { Injectable, Logger } from '@nestjs/common';
import { sendTextMessage } from './ilink/send-text.js';
import { WechatAccountService } from './wechat-account.service.js';

@Injectable()
export class WechatOutboundService {
  private readonly logger = new Logger(WechatOutboundService.name);

  constructor(private readonly accounts: WechatAccountService) {}

  async sendByDbId(params: {
    accountDbId: string;
    peerUserId: string;
    text: string;
    contextToken?: string;
  }): Promise<boolean> {
    const row = await this.accounts.findById(params.accountDbId);
    if (!row || !row.enabled) {
      this.logger.warn(
        `sendByDbId: account missing/disabled ${params.accountDbId}`,
      );
      return false;
    }

    const peerMap = this.accounts.getPeerContext(row);
    const contextToken =
      params.contextToken || peerMap[params.peerUserId]?.contextToken;

    try {
      await sendTextMessage({
        to: params.peerUserId,
        text: params.text,
        contextToken,
        opts: {
          baseUrl: row.baseUrl,
          token: row.token,
        },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `微信出站失败 account=${row.accountId} peer=${params.peerUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async sendByIlinkAccountId(params: {
    accountId: string;
    peerUserId: string;
    text: string;
    contextToken?: string;
  }): Promise<boolean> {
    const row = await this.accounts.findByAccountId(params.accountId);
    if (!row) {
      this.logger.warn(`sendByIlinkAccountId: 未找到 ${params.accountId}`);
      return false;
    }
    return this.sendByDbId({
      accountDbId: row.id,
      peerUserId: params.peerUserId,
      text: params.text,
      contextToken: params.contextToken,
    });
  }
}
