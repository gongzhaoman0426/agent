import { randomUUID } from 'node:crypto';
import { apiGetFetch, apiPostFetch, DEFAULT_ILINK_BASE_URL } from './api.js';

export const DEFAULT_ILINK_BOT_TYPE = '3';

const ACTIVE_LOGIN_TTL_MS = 5 * 60_000;
const QR_LONG_POLL_TIMEOUT_MS = 35_000;

export type QrLoginStatus =
  | 'wait'
  | 'scaned'
  | 'confirmed'
  | 'expired'
  | 'scaned_but_redirect'
  | 'need_verifycode'
  | 'verify_code_blocked'
  | 'binded_redirect';

type ActiveLogin = {
  sessionKey: string;
  qrcode: string;
  qrcodeUrl: string;
  startedAt: number;
  status?: QrLoginStatus;
  pendingVerifyCode?: string;
  currentApiBaseUrl?: string;
  /** 确认后暂存，供 status 接口返回一次 */
  result?: {
    connected: boolean;
    alreadyConnected?: boolean;
    botToken?: string;
    accountId?: string;
    baseUrl?: string;
    scannerUserId?: string;
    message: string;
  };
};

const activeLogins = new Map<string, ActiveLogin>();

interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface StatusResponse {
  status: QrLoginStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}

function isLoginFresh(login: ActiveLogin): boolean {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function purgeExpiredLogins() {
  for (const [id, login] of activeLogins) {
    if (!isLoginFresh(login) && !login.result) {
      activeLogins.delete(id);
    }
  }
}

async function fetchQRCode(
  apiBaseUrl: string,
  botType: string,
): Promise<QRCodeResponse> {
  const rawText = await apiPostFetch({
    baseUrl: apiBaseUrl,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
    body: JSON.stringify({ local_token_list: [] }),
    label: 'fetchQRCode',
  });
  return JSON.parse(rawText) as QRCodeResponse;
}

async function pollQRStatus(
  apiBaseUrl: string,
  qrcode: string,
  verifyCode?: string,
): Promise<StatusResponse> {
  try {
    let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    if (verifyCode) {
      endpoint += `&verify_code=${encodeURIComponent(verifyCode)}`;
    }
    const rawText = await apiGetFetch({
      baseUrl: apiBaseUrl,
      endpoint,
      timeoutMs: QR_LONG_POLL_TIMEOUT_MS,
      label: 'pollQRStatus',
    });
    return JSON.parse(rawText) as StatusResponse;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'wait' };
    }
    return { status: 'wait' };
  }
}

export async function startWeixinQrLogin(opts?: {
  force?: boolean;
  botType?: string;
}): Promise<{
  sessionKey: string;
  qrcodeUrl?: string;
  message: string;
}> {
  purgeExpiredLogins();
  const sessionKey = randomUUID();
  const botType = opts?.botType || DEFAULT_ILINK_BOT_TYPE;

  try {
    const qrResponse = await fetchQRCode(DEFAULT_ILINK_BASE_URL, botType);
    const qrcodeUrl = qrResponse.qrcode_img_content?.trim();
    if (!qrResponse.qrcode || !qrcodeUrl) {
      return {
        sessionKey,
        message: '微信未返回二维码内容，请稍后重试',
      };
    }
    activeLogins.set(sessionKey, {
      sessionKey,
      qrcode: qrResponse.qrcode,
      qrcodeUrl,
      startedAt: Date.now(),
      currentApiBaseUrl: DEFAULT_ILINK_BASE_URL,
    });
    return {
      sessionKey,
      qrcodeUrl,
      message: '请用手机微信扫描二维码以连接',
    };
  } catch (err) {
    return {
      sessionKey,
      message: `启动登录失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function submitWeixinVerifyCode(
  sessionKey: string,
  code: string,
): { ok: boolean; message: string } {
  const login = activeLogins.get(sessionKey);
  if (!login || !isLoginFresh(login)) {
    return { ok: false, message: '登录会话不存在或已过期' };
  }
  login.pendingVerifyCode = code.trim();
  return { ok: true, message: '已提交配对码，继续验证中' };
}

/**
 * 单次轮询二维码状态（供 HTTP 接口反复调用，替代 CLI 阻塞 wait）。
 */
export async function pollWeixinQrLogin(sessionKey: string): Promise<{
  status: QrLoginStatus | 'none' | 'done';
  qrcodeUrl?: string;
  needVerifyCode?: boolean;
  connected?: boolean;
  alreadyConnected?: boolean;
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  scannerUserId?: string;
  message: string;
}> {
  const login = activeLogins.get(sessionKey);
  if (!login) {
    return { status: 'none', message: '当前没有进行中的登录' };
  }
  if (login.result) {
    const result = login.result;
    activeLogins.delete(sessionKey);
    return {
      status: 'done',
      connected: result.connected,
      alreadyConnected: result.alreadyConnected,
      botToken: result.botToken,
      accountId: result.accountId,
      baseUrl: result.baseUrl,
      scannerUserId: result.scannerUserId,
      message: result.message,
    };
  }
  if (!isLoginFresh(login)) {
    activeLogins.delete(sessionKey);
    return { status: 'expired', message: '二维码已过期，请重新生成' };
  }

  const currentBaseUrl = login.currentApiBaseUrl ?? DEFAULT_ILINK_BASE_URL;
  const statusResponse = await pollQRStatus(
    currentBaseUrl,
    login.qrcode,
    login.pendingVerifyCode,
  );
  login.status = statusResponse.status;

  switch (statusResponse.status) {
    case 'wait':
      return {
        status: 'wait',
        qrcodeUrl: login.qrcodeUrl,
        message: '等待扫码',
      };
    case 'scaned':
      if (login.pendingVerifyCode) {
        login.pendingVerifyCode = undefined;
      }
      return {
        status: 'scaned',
        qrcodeUrl: login.qrcodeUrl,
        message: '已扫码，正在验证',
      };
    case 'need_verifycode':
      return {
        status: 'need_verifycode',
        qrcodeUrl: login.qrcodeUrl,
        needVerifyCode: true,
        message: login.pendingVerifyCode
          ? '配对码不匹配，请重新输入'
          : '请输入手机微信显示的配对码',
      };
    case 'scaned_but_redirect': {
      if (statusResponse.redirect_host) {
        login.currentApiBaseUrl = `https://${statusResponse.redirect_host}`;
      }
      return {
        status: 'scaned_but_redirect',
        qrcodeUrl: login.qrcodeUrl,
        message: '正在切换节点…',
      };
    }
    case 'expired':
      try {
        const qrResponse = await fetchQRCode(
          DEFAULT_ILINK_BASE_URL,
          DEFAULT_ILINK_BOT_TYPE,
        );
        login.qrcode = qrResponse.qrcode;
        login.qrcodeUrl = qrResponse.qrcode_img_content;
        login.startedAt = Date.now();
        login.pendingVerifyCode = undefined;
        return {
          status: 'expired',
          qrcodeUrl: login.qrcodeUrl,
          message: '二维码已刷新，请重新扫描',
        };
      } catch (err) {
        activeLogins.delete(sessionKey);
        return {
          status: 'expired',
          message: `刷新二维码失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    case 'verify_code_blocked':
      login.pendingVerifyCode = undefined;
      return {
        status: 'verify_code_blocked',
        message: '多次输入错误，请重新发起登录',
      };
    case 'binded_redirect':
      login.result = {
        connected: false,
        alreadyConnected: true,
        message: '该微信已绑定过，无需重复连接',
      };
      return {
        status: 'binded_redirect',
        alreadyConnected: true,
        message: login.result.message,
      };
    case 'confirmed': {
      if (!statusResponse.ilink_bot_id) {
        activeLogins.delete(sessionKey);
        return {
          status: 'confirmed',
          connected: false,
          message: '登录失败：服务器未返回 bot id',
        };
      }
      login.result = {
        connected: true,
        botToken: statusResponse.bot_token,
        accountId: statusResponse.ilink_bot_id,
        baseUrl: statusResponse.baseurl || DEFAULT_ILINK_BASE_URL,
        scannerUserId: statusResponse.ilink_user_id,
        message: '微信已连接',
      };
      return {
        status: 'confirmed',
        connected: true,
        botToken: statusResponse.bot_token,
        accountId: statusResponse.ilink_bot_id,
        baseUrl: statusResponse.baseurl || DEFAULT_ILINK_BASE_URL,
        scannerUserId: statusResponse.ilink_user_id,
        message: '微信已连接',
      };
    }
    default:
      return {
        status: statusResponse.status,
        qrcodeUrl: login.qrcodeUrl,
        message: `状态: ${statusResponse.status}`,
      };
  }
}
