/** 微信会话 ID：按 Agent + 绑定账号 + 对端隔离 */
export function buildWechatSessionId(
  agentId: string,
  accountId: string,
  peerWxid: string,
): string {
  return `wechat:${agentId}:${accountId}:${peerWxid}`;
}

export type ParsedWechatSessionId = {
  agentId: string;
  accountId: string;
  peerWxid: string;
};

/** 解析 `wechat:{agentId}:{accountId}:{peerWxid}`；peer 可含特殊字符 */
export function parseWechatSessionId(
  sessionId: string,
): ParsedWechatSessionId | null {
  const m = sessionId.match(/^wechat:([^:]+):([^:]+):(.+)$/);
  if (!m) return null;
  return {
    agentId: m[1],
    accountId: m[2],
    peerWxid: m[3],
  };
}

export function isWechatSessionId(sessionId: string): boolean {
  return sessionId.startsWith('wechat:');
}
