export function getPadBaseUrl(): string {
  const url = process.env.WECHAT_PAD_BASE_URL?.trim();
  if (!url) {
    throw new Error('未配置 WECHAT_PAD_BASE_URL');
  }
  return url.replace(/\/$/, '');
}

export function getPadAdminKey(): string {
  const key = process.env.WECHAT_PAD_ADMIN_KEY?.trim();
  if (!key) {
    throw new Error('未配置 WECHAT_PAD_ADMIN_KEY');
  }
  return key;
}

/** v875 能访问到的 agent-next 公网/内网根地址，如 https://agent.example.com 或 http://IP:3003 */
export function getPadCallbackBaseUrl(): string | undefined {
  const url = process.env.WECHAT_PAD_CALLBACK_BASE_URL?.trim();
  return url ? url.replace(/\/$/, '') : undefined;
}
