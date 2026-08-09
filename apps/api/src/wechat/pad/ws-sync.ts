import { getPadBaseUrl } from './config.js';
import { parsePadJson } from './client.js';
import { parseSyncMessages } from './message.js';
import type { ParsedPadMessage } from './types.js';

export type PadWsSyncHandlers = {
  onMessage: (msg: ParsedPadMessage) => void | Promise<void>;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
};

/** ws://host/ws/GetSyncMsg?key=... */
export function buildPadSyncWsUrl(authKey: string): string {
  const httpBase = getPadBaseUrl();
  const wsBase = httpBase.replace(/^http/i, 'ws');
  const url = new URL(`${wsBase}/ws/GetSyncMsg`);
  url.searchParams.set('key', authKey);
  return url.toString();
}

/**
 * 连接 v875 WebSocket 同步消息（唯一可靠入站）。
 * 每条 WS 帧通常是单条 AddMsg JSON；也兼容包一层 Data/AddMsgs。
 */
export function connectPadSyncWs(
  authKey: string,
  handlers: PadWsSyncHandlers,
  abortSignal?: AbortSignal,
): WebSocket {
  const url = buildPadSyncWsUrl(authKey);
  const ws = new WebSocket(url);

  const onAbort = () => {
    try {
      ws.close(1000, 'aborted');
    } catch {
      // ignore
    }
  };
  if (abortSignal) {
    if (abortSignal.aborted) onAbort();
    else abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  ws.addEventListener('open', () => {
    handlers.onOpen?.();
  });

  ws.addEventListener('message', (event) => {
    try {
      const text =
        typeof event.data === 'string'
          ? event.data
          : Buffer.isBuffer(event.data)
            ? event.data.toString('utf8')
            : String(event.data);
      const parsed = parseWsSyncPayload(text);
      for (const msg of parsed) {
        void Promise.resolve(handlers.onMessage(msg)).catch(() => undefined);
      }
    } catch (error) {
      handlers.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  });

  ws.addEventListener('error', () => {
    handlers.onError?.(new Error('WebSocket 连接错误'));
  });

  ws.addEventListener('close', (event) => {
    if (abortSignal) {
      abortSignal.removeEventListener('abort', onAbort);
    }
    handlers.onClose?.(event.code, event.reason || '');
  });

  return ws;
}

export function parseWsSyncPayload(text: string): ParsedPadMessage[] {
  const raw = text?.trim();
  if (!raw) return [];
  const data = parsePadJson(raw);
  // 单条 AddMsg
  const asOne = parseSyncMessages([data]);
  if (asOne.length > 0) return asOne;
  // 整包 { AddMsgs: [...] } / Data
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.Data !== undefined) return parseSyncMessages(obj.Data);
    return parseSyncMessages(data);
  }
  return [];
}
