import type { PadDto } from './types.js';
import { getPadBaseUrl } from './config.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export class PadApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'PadApiError';
  }
}

export async function padRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    key?: string;
    body?: unknown;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
    /**
     * 是否检查 Data 内业务 ret（baseResponse.ret / spamTips / tenpayErr…）。
     * 默认 true：v875 常 Code=200 但内部已失败。
     */
    assertBusiness?: boolean;
  },
): Promise<T> {
  const base = getPadBaseUrl();
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  if (options?.key) {
    url.searchParams.set('key', options.key);
  }

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:
      method === 'POST' && options?.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    signal:
      options?.abortSignal ??
      AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new PadApiError(
      `v875 HTTP ${response.status}: ${path}`,
      response.status,
    );
  }

  // new_msg_id 等雪花 ID 超过 Number.MAX_SAFE_INTEGER，JSON.parse 会丢精度，
  // 导致入站去重误判。先把 ≥16 位整数收成字符串再解析。
  const rawText = await response.text();
  const dto = parsePadJson(rawText) as PadDto<T>;
  if (dto.Code !== 200) {
    throw new PadApiError(
      dto.Text?.trim() || `v875 业务错误 Code=${dto.Code}`,
      dto.Code,
      dto.Data,
    );
  }

  if (options?.assertBusiness !== false) {
    assertPadBusinessOk(dto.Data, path);
  }
  return dto.Data;
}

/**
 * 保留消息雪花 ID 精度的 JSON 解析。
 * 只改写已知 msgId 字段，避免误伤 content 内嵌 JSON 里的大整数。
 */
export function parsePadJson(text: string): unknown {
  const safe = text.replace(
    /"(new_msg_id|newMsgId|msg_id|msgId)"\s*:\s*(-?\d{15,})/g,
    '"$1":"$2"',
  );
  return JSON.parse(safe);
}

/** 解析微信错误 XML / errMsg 对象中的可读文案 */
export function extractPadErrText(errMsg: unknown): string {
  if (!errMsg) return '';
  if (typeof errMsg === 'string') {
    const cdata = errMsg.match(/<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/i);
    if (cdata?.[1]) return cdata[1].trim();
    return errMsg.trim();
  }
  if (typeof errMsg === 'object') {
    const obj = errMsg as Record<string, unknown>;
    if (typeof obj.str === 'string') return extractPadErrText(obj.str);
    if (typeof obj.Str === 'string') return extractPadErrText(obj.Str);
  }
  return '';
}

/**
 * v875 常见：外层 Code=200，内层 baseResponse.ret≠0 / spamTips / tenpayErr。
 * 发消息接口 Data 常为数组，失败在 item.resp / chat_send_ret_list.ret。
 */
export function assertPadBusinessOk(data: unknown, path: string) {
  if (data == null) return;

  if (Array.isArray(data)) {
    for (const item of data) {
      assertPadBusinessOk(item, path);
    }
    return;
  }

  if (typeof data !== 'object') return;

  const root = data as Record<string, unknown>;

  if (root.isSendSuccess === false) {
    throw new PadApiError(`v875 ${path}: 发送失败`, undefined, data);
  }

  // 发消息：chat_send_ret_list[].ret（失败时可能是 uint32 的 -2 → 4294967294）
  const sendList =
    (root.chat_send_ret_list as unknown) ??
    (root.chatSendRetList as unknown) ??
    ((root.resp as Record<string, unknown> | undefined)?.chat_send_ret_list as
      | unknown
      | undefined);
  if (Array.isArray(sendList)) {
    for (const row of sendList) {
      if (!row || typeof row !== 'object') continue;
      const ret = Number((row as Record<string, unknown>).ret ?? 0);
      if (ret !== 0) {
        throw new PadApiError(
          `v875 ${path}: 消息未送达（ret=${ret >>> 0}）`,
          ret,
          data,
        );
      }
    }
  }

  const nodes: Record<string, unknown>[] = [root];
  for (const key of ['ContactList', 'contactList', 'snsObject', 'resp']) {
    const nested = root[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      nodes.push(nested as Record<string, unknown>);
    }
  }

  const spamTips =
    typeof root.spamTips === 'string' ? root.spamTips.trim() : '';

  for (const node of nodes) {
    const br =
      node.baseResponse ?? node.base_response ?? node.baseResp;
    if (br && typeof br === 'object') {
      const ret = Number((br as Record<string, unknown>).ret ?? 0);
      if (ret !== 0) {
        const msg =
          spamTips ||
          extractPadErrText((br as Record<string, unknown>).errMsg) ||
          extractPadErrText((br as Record<string, unknown>).ErrMsg) ||
          `业务 ret=${ret}`;
        throw new PadApiError(`v875 ${path}: ${msg}`, ret, data);
      }
    }
  }

  if (spamTips) {
    throw new PadApiError(`v875 ${path}: ${spamTips}`, undefined, data);
  }

  const tenpayType = Number(root.tenpayErrType ?? root.TenpayErrType ?? 0);
  if (tenpayType !== 0) {
    const msg =
      String(root.tenpayErrMsg ?? root.TenpayErrMsg ?? '').trim() ||
      `tenpayErrType=${tenpayType}`;
    throw new PadApiError(`v875 ${path}: ${msg}`, tenpayType, data);
  }

  if (root.retCode != null && Number(root.retCode) !== 0) {
    const msg =
      String(root.errMsg ?? root.ErrMsg ?? '').trim() ||
      `retCode=${root.retCode}`;
    throw new PadApiError(`v875 ${path}: ${msg}`, Number(root.retCode), data);
  }
}
