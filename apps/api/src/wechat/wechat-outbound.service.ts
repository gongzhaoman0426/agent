import { Injectable, Logger } from '@nestjs/common';
import {
  fetchAsBase64,
  sendImageMessage,
  sendTextMessage,
  sendVoiceMessage,
} from './pad/message.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatTtsService } from './wechat-tts.service.js';

/** 多段消息间隔：2～3 秒随机，更接近真人连发节奏 */
const SEGMENT_GAP_MIN_MS = 2_000;
const SEGMENT_GAP_MAX_MS = 3_000;
const MAX_SEGMENTS = 20;

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
    /** 为 true（默认）时按空行等拆成多条消息依次发送 */
    splitSegments?: boolean;
  }): Promise<boolean> {
    const split = params.splitSegments !== false;
    const parts = split
      ? splitWechatReplySegments(params.text)
      : [params.text.trim()].filter(Boolean);
    if (parts.length === 0) return true;

    let allOk = true;
    for (let i = 0; i < parts.length; i += 1) {
      const ok = await this.sendOneText({
        accountDbId: params.accountDbId,
        peerWxid: params.peerWxid,
        text: parts[i],
      });
      if (!ok) allOk = false;
      if (i < parts.length - 1) {
        await sleep(segmentGapMs());
      }
    }
    if (parts.length > 1) {
      this.logger.log(
        `分段发送 ${parts.length} 条 to=${params.peerWxid} ok=${allOk}`,
      );
    }
    return allOk;
  }

  private async sendOneText(params: {
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

/** 按空行 / --- 分隔符拆成多段；单段过长时再按换行适度切开 */
export function splitWechatReplySegments(text: string): string[] {
  const raw = text?.replace(/\r\n/g, '\n').trim() ?? '';
  if (!raw) return [];

  const byBlank = raw
    .split(/\n{2,}|\n\s*---+\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const block of byBlank) {
    if (block.length <= 900) {
      parts.push(block);
      continue;
    }
    // 超长段落：按单行拆，避免一条消息过大
    const lines = block
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    let buf = '';
    for (const line of lines) {
      if (!buf) {
        buf = line;
        continue;
      }
      if (`${buf}\n${line}`.length > 900) {
        parts.push(buf);
        buf = line;
      } else {
        buf = `${buf}\n${line}`;
      }
    }
    if (buf) parts.push(buf);
  }

  return parts.slice(0, MAX_SEGMENTS);
}

function segmentGapMs(): number {
  return (
    SEGMENT_GAP_MIN_MS +
    Math.floor(Math.random() * (SEGMENT_GAP_MAX_MS - SEGMENT_GAP_MIN_MS + 1))
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
