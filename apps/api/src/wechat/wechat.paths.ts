import path from 'node:path';

export function wechatDataRoot(): string {
  return path.join(process.cwd(), 'data', 'wechat');
}

export function wechatAccountDir(accountId: string): string {
  const safe = accountId.replace(/[^a-zA-Z0-9_@.\-]/g, '_');
  return path.join(wechatDataRoot(), safe);
}

export function wechatSyncBufPath(accountId: string): string {
  return path.join(wechatAccountDir(accountId), 'sync-buf.json');
}

/** 微信会话 ID：同一用户 + 对端永远复用 */
export function buildWechatSessionId(
  ownerUserId: string,
  peerUserId: string,
): string {
  return `wechat:${ownerUserId}:${peerUserId}`;
}
