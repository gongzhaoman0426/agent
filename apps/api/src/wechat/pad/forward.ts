import { padRequest } from './client.js';

/**
 * POST /forward/SetForward — 转发新消息地址（空 url 表示删除）
 * swagger 字段为 Url；兼容部分实现的小写 url
 */
export async function setForwardUrl(authKey: string, url: string): Promise<void> {
  await padRequest('POST', '/forward/SetForward', {
    key: authKey,
    body: { Url: url, url },
  });
}

export function buildWebhookUrl(callbackBaseUrl: string, authKey: string): string {
  const base = callbackBaseUrl.replace(/\/$/, '');
  return `${base}/api/wechat/webhook/${encodeURIComponent(authKey)}`;
}
