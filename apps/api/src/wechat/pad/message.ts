import { padRequest } from './client.js';
import type { PadAddMsg, PadSyncBatch, ParsedPadMessage } from './types.js';

function extractStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.str === 'string') return obj.str;
    if (typeof obj.Str === 'string') return obj.Str;
  }
  return '';
}

function normalizeAddMsg(msg: PadAddMsg): ParsedPadMessage | null {
  const fromWxid = extractStr(
    msg.fromUserName ?? msg.FromUserName ?? msg.from_user_name,
  ).trim();
  const toWxid = extractStr(
    msg.toUserName ?? msg.ToUserName ?? msg.to_user_name,
  ).trim();
  const content = extractStr(msg.content ?? msg.Content);
  const msgType = Number(msg.msgType ?? msg.MsgType ?? msg.msg_type ?? 0);
  const msgIdRaw = msg.new_msg_id ?? msg.newMsgId ?? msg.msg_id ?? msg.msgId;
  const msgId =
    msgIdRaw === undefined || msgIdRaw === null ? undefined : String(msgIdRaw);
  if (!fromWxid) return null;
  return { fromWxid, toWxid, msgType, content, msgId };
}

/** 解析 HttpSyncMsg / GetRedisSyncMsg Data */
export function parseSyncMessages(data: unknown): ParsedPadMessage[] {
  if (Array.isArray(data)) {
    // HttpSyncMsg: Data 可能是 batch 数组，也可能直接是 AddMsg 列表
    const out: ParsedPadMessage[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as PadSyncBatch & PadAddMsg;
      const nested = obj.AddMsgs ?? obj.addMsgs;
      if (Array.isArray(nested)) {
        for (const msg of nested) {
          const parsed = normalizeAddMsg(msg);
          if (parsed) out.push(parsed);
        }
        continue;
      }
      const parsed = normalizeAddMsg(obj);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  if (data && typeof data === 'object') {
    const batch = data as PadSyncBatch;
    const msgs = batch.AddMsgs ?? batch.addMsgs ?? [];
    const out: ParsedPadMessage[] = [];
    for (const msg of msgs) {
      const parsed = normalizeAddMsg(msg);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  return [];
}

/**
 * POST /message/HttpSyncMsg — 文档中的 HTTP 轮询队列。
 * v875 实测常返回空数组，入站请优先用 getRedisSyncMsg。
 */
export async function httpSyncMsg(
  authKey: string,
  count = 20,
  abortSignal?: AbortSignal,
): Promise<ParsedPadMessage[]> {
  const data = await padRequest<unknown>('POST', '/message/HttpSyncMsg', {
    key: authKey,
    body: { Count: count },
    timeoutMs: 90_000,
    abortSignal,
  });
  return parseSyncMessages(data);
}

/**
 * POST /other/GetRedisSyncMsg — 读取 Redis 中缓存的同步包（含 AddMsgs）。
 * v875 实测消息在这里；调用方需按 msgId 去重。
 */
export async function getRedisSyncMsg(
  authKey: string,
  abortSignal?: AbortSignal,
): Promise<ParsedPadMessage[]> {
  const data = await padRequest<unknown>('POST', '/other/GetRedisSyncMsg', {
    key: authKey,
    body: {},
    timeoutMs: 60_000,
    abortSignal,
  });
  return parseSyncMessages(data);
}

export async function sendTextMessage(input: {
  authKey: string;
  toWxid: string;
  text: string;
}): Promise<void> {
  await padRequest('POST', '/message/SendTextMessage', {
    key: input.authKey,
    body: {
      MsgItem: [
        {
          MsgType: 1,
          TextContent: input.text,
          ToUserName: input.toWxid,
        },
      ],
    },
  });
}

export async function sendImageMessage(input: {
  authKey: string;
  toWxid: string;
  /** 纯 base64 或 data URL */
  imageBase64: string;
}): Promise<void> {
  let imageContent = input.imageBase64.trim();
  const comma = imageContent.indexOf(',');
  if (imageContent.startsWith('data:') && comma >= 0) {
    imageContent = imageContent.slice(comma + 1);
  }
  await padRequest('POST', '/message/SendImageNewMessage', {
    key: input.authKey,
    body: {
      MsgItem: [
        {
          MsgType: 2,
          ImageContent: imageContent,
          ToUserName: input.toWxid,
        },
      ],
    },
  });
}

export async function sendVoiceMessage(input: {
  authKey: string;
  toWxid: string;
  voiceBase64: string;
  /** 秒 */
  voiceSecond: number;
  /** 语音格式，常见 silk=4 */
  voiceFormat?: number;
}): Promise<void> {
  let voiceData = input.voiceBase64.trim();
  const comma = voiceData.indexOf(',');
  if (voiceData.startsWith('data:') && comma >= 0) {
    voiceData = voiceData.slice(comma + 1);
  }
  await padRequest('POST', '/message/SendVoice', {
    key: input.authKey,
    body: {
      ToUserName: input.toWxid,
      VoiceData: voiceData,
      VoiceSecond: Math.max(1, Math.round(input.voiceSecond)),
      VoiceFormat: input.voiceFormat ?? 4,
    },
  });
}

/** 下载 URL 为 base64（不含 data: 前缀） */
export async function fetchAsBase64(url: string): Promise<{
  base64: string;
  contentType: string;
}> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`下载媒体失败 HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const buf = Buffer.from(await response.arrayBuffer());
  return { base64: buf.toString('base64'), contentType };
}
