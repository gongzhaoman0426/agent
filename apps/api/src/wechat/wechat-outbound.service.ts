import { Injectable, Logger } from '@nestjs/common';
import {
  fetchAsBase64,
  sendImageMessage,
  sendTextMessage,
  sendVoiceMessage,
} from './pad/message.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatTtsService } from './wechat-tts.service.js';

@Injectable()
export class WechatOutboundService {
  private readonly logger = new Logger(WechatOutboundService.name);

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly tts: WechatTtsService,
  ) {}

  async sendByDbId(params: {
    accountDbId: string;
    peerWxid: string;
    text: string;
  }): Promise<boolean> {
    const row = await this.accounts.findById(params.accountDbId);
    if (!row || !row.enabled) {
      this.logger.warn(
        `sendByDbId: account missing/disabled ${params.accountDbId}`,
      );
      return false;
    }

    try {
      await sendTextMessage({
        authKey: row.authKey,
        toWxid: params.peerWxid,
        text: params.text,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `微信文本出站失败 account=${row.wxid} peer=${params.peerWxid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async sendImageByDbId(params: {
    accountDbId: string;
    peerWxid: string;
    imageUrl: string;
  }): Promise<boolean> {
    const row = await this.accounts.findById(params.accountDbId);
    if (!row || !row.enabled) return false;

    try {
      const imageUrl = params.imageUrl.trim();
      if (!imageUrl) {
        throw new Error('缺少 imageUrl');
      }
      const { base64: imageBase64 } = await fetchAsBase64(imageUrl);
      await sendImageMessage({
        authKey: row.authKey,
        toWxid: params.peerWxid,
        imageBase64,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `微信图片出站失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** 文字 TTS → silk → SendVoice */
  async sendVoiceTextByDbId(params: {
    accountDbId: string;
    peerWxid: string;
    text: string;
  }): Promise<boolean> {
    const row = await this.accounts.findById(params.accountDbId);
    if (!row || !row.enabled) return false;

    try {
      const { silkBase64, voiceSecond } = await this.tts.synthesizeSilk(
        params.text,
      );
      await sendVoiceMessage({
        authKey: row.authKey,
        toWxid: params.peerWxid,
        voiceBase64: silkBase64,
        voiceSecond,
        voiceFormat: 4,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `微信语音出站失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
