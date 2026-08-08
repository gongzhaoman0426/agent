/** 微信会话 ID：按 Agent + 绑定账号 + 对端隔离 */
export function buildWechatSessionId(
  agentId: string,
  accountId: string,
  peerWxid: string,
): string {
  return `wechat:${agentId}:${accountId}:${peerWxid}`;
}
