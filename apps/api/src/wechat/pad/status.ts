import { padRequest, PadApiError } from './client.js';

export type PadOnlineStatus = {
  online: boolean;
  message: string;
  raw?: unknown;
};

/** 检测账号长连接是否存在（与扫码 CheckLoginStatus 不同） */
export async function getPadOnlineStatus(
  authKey: string,
): Promise<PadOnlineStatus> {
  try {
    const data = await padRequest<unknown>('GET', '/login/GetLoginStatus', {
      key: authKey,
      timeoutMs: 15_000,
    });
    return { online: true, message: '在线', raw: data };
  } catch (error) {
    const message =
      error instanceof PadApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    const offline =
      message.includes('不存在') ||
      message.includes('离线') ||
      message.includes('重新登录');
    return {
      online: false,
      message: offline ? `账号离线：${message}` : message,
    };
  }
}
