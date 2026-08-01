import crypto from 'node:crypto';
import type {
  BaseInfo,
  GetUpdatesResp,
  SendMessageReq,
  SendMessageResp,
} from './types.js';

export const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const ILINK_APP_ID = 'bot';

const CHANNEL_VERSION = '0.1.0';
const DEFAULT_BOT_AGENT = 'AgentNext/0.1.0';
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_API_TIMEOUT_MS = 15_000;

/** 0x00MMNNPP */
function buildClientVersion(version: string): number {
  const parts = version.split('.').map((part) => parseInt(part, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

const ILINK_APP_CLIENT_VERSION = buildClientVersion(CHANNEL_VERSION);

export type WeixinApiOptions = {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  botAgent?: string;
};

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function buildBaseInfo(botAgent?: string): BaseInfo {
  return {
    channel_version: CHANNEL_VERSION,
    bot_agent: botAgent?.trim() || process.env.WECHAT_BOT_AGENT || DEFAULT_BOT_AGENT,
  };
}

function buildCommonHeaders(): Record<string, string> {
  return {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  };
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    ...buildCommonHeaders(),
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function apiGetFetch(params: {
  baseUrl: string;
  endpoint: string;
  timeoutMs?: number;
  label: string;
}): Promise<string> {
  const url = new URL(params.endpoint, ensureTrailingSlash(params.baseUrl));
  const controller =
    params.timeoutMs != null && params.timeoutMs > 0
      ? new AbortController()
      : undefined;
  const timer =
    controller && params.timeoutMs
      ? setTimeout(() => controller.abort(), params.timeoutMs)
      : undefined;
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: buildCommonHeaders(),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`${params.label} ${res.status}: ${rawText}`);
    }
    return rawText;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function apiPostFetch(params: {
  baseUrl: string;
  endpoint: string;
  body: string;
  token?: string;
  timeoutMs?: number;
  label: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const url = new URL(params.endpoint, ensureTrailingSlash(params.baseUrl));
  const controller =
    params.timeoutMs !== undefined ? new AbortController() : undefined;
  const timer =
    controller && params.timeoutMs !== undefined
      ? setTimeout(() => controller.abort(), params.timeoutMs)
      : undefined;

  let onExternalAbort: (() => void) | undefined;
  if (controller && params.abortSignal) {
    if (params.abortSignal.aborted) {
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      params.abortSignal.addEventListener('abort', onExternalAbort, {
        once: true,
      });
    }
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders(params.token),
      body: params.body,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`${params.label} ${res.status}: ${rawText}`);
    }
    return rawText;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onExternalAbort && params.abortSignal) {
      params.abortSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function getUpdates(params: {
  baseUrl: string;
  token?: string;
  get_updates_buf?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  botAgent?: string;
}): Promise<GetUpdatesResp> {
  const timeout = params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS;
  try {
    const rawText = await apiPostFetch({
      baseUrl: params.baseUrl,
      endpoint: 'ilink/bot/getupdates',
      body: JSON.stringify({
        get_updates_buf: params.get_updates_buf ?? '',
        base_info: buildBaseInfo(params.botAgent),
      }),
      token: params.token,
      timeoutMs: timeout,
      label: 'getUpdates',
      abortSignal: params.abortSignal,
    });
    return JSON.parse(rawText) as GetUpdatesResp;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: params.get_updates_buf };
    }
    throw err;
  }
}

export async function sendMessage(
  params: WeixinApiOptions & { body: SendMessageReq },
): Promise<void> {
  const rawText = await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: JSON.stringify({
      ...params.body,
      base_info: buildBaseInfo(params.botAgent),
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    label: 'sendMessage',
  });
  const resp = JSON.parse(rawText) as SendMessageResp;
  if (resp.ret && resp.ret !== 0) {
    throw new Error(
      `sendMessage ret=${resp.ret} errmsg=${resp.errmsg ?? '(none)'}`,
    );
  }
}
