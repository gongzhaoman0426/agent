import { padRequest } from './client.js';
import { getPadAdminKey } from './config.js';
import type {
  CheckLoginStatusData,
  GenAuthKeyData,
  LoginQrData,
} from './types.js';

/** POST /admin/GenAuthKey1 — 生成新设备 AuthKey */
export async function genAuthKey(days = 30): Promise<string> {
  const data = await padRequest<GenAuthKeyData>(
    'POST',
    '/admin/GenAuthKey1',
    {
      key: getPadAdminKey(),
      body: { Count: 1, Days: days },
    },
  );
  const key = Array.isArray(data) ? data[0] : undefined;
  if (!key?.trim()) {
    throw new Error('GenAuthKey1 未返回 AuthKey');
  }
  return key.trim();
}

/**
 * POST /login/GetLoginQrCodeNewX — iPad 过验证推荐接口
 * 文档：下次登录 Way 务必不要传参；出验证时再传 harmony|mac|win 等
 */
export async function getLoginQrCodeNewX(input: {
  authKey: string;
  proxy?: string;
  way?: string;
  check?: boolean;
}): Promise<LoginQrData> {
  const body: Record<string, unknown> = {
    Check: input.check ?? false,
    Proxy: input.proxy?.trim() || '',
  };
  const way = input.way?.trim();
  if (way) {
    body.Way = way;
  }
  return padRequest<LoginQrData>('POST', '/login/GetLoginQrCodeNewX', {
    key: input.authKey,
    body,
  });
}

/** GET /login/CheckLoginStatus — 检测扫码状态 / 获取验证地址 */
export async function checkLoginStatus(
  authKey: string,
): Promise<CheckLoginStatusData> {
  return padRequest<CheckLoginStatusData>('GET', '/login/CheckLoginStatus', {
    key: authKey,
  });
}

/** POST /login/VerifiPhoneCode — 提交登录验证码（仅扫码登录） */
export async function verifyPhoneCode(
  authKey: string,
  verifiCode: string,
): Promise<unknown> {
  return padRequest('POST', '/login/VerifiPhoneCode', {
    key: authKey,
    body: { VerifiCode: verifiCode.trim() },
  });
}

/** POST /login/WakeUpLogin — 唤醒已扫码登录（二次登录） */
export async function wakeUpLogin(input: {
  authKey: string;
  proxy?: string;
}): Promise<unknown> {
  return padRequest('POST', '/login/WakeUpLogin', {
    key: input.authKey,
    body: {
      Check: false,
      Proxy: input.proxy?.trim() || '',
    },
  });
}

/** GET /user/GetProfile — 在线后取 wxid / 昵称 */
export async function getOnlineProfile(authKey: string): Promise<{
  wxid?: string;
  nickname?: string;
}> {
  const data = await padRequest<Record<string, unknown>>(
    'GET',
    '/user/GetProfile',
    { key: authKey, timeoutMs: 20_000 },
  );

  const pickStr = (...vals: unknown[]) => {
    for (const value of vals) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (typeof obj.str === 'string' && obj.str.trim()) return obj.str.trim();
        if (typeof obj.Str === 'string' && obj.Str.trim()) return obj.Str.trim();
      }
    }
    return undefined;
  };

  const userInfo =
    (data?.userInfo as Record<string, unknown> | undefined) ||
    (data?.UserInfo as Record<string, unknown> | undefined) ||
    data;

  const wxid = pickStr(
    userInfo?.userName,
    userInfo?.UserName,
    userInfo?.wxid,
    userInfo?.Wxid,
    data?.userName,
    data?.UserName,
    data?.wxid,
  );
  const nickname = pickStr(
    userInfo?.nickName,
    userInfo?.NickName,
    data?.nickName,
    data?.NickName,
  );
  return { wxid, nickname };
}

/** 从短图服务 URL 抽出 weixin.qq.com/x/... 载荷，便于本地生成二维码 */
export function extractQrPayload(qrCodeUrl: string): string {
  const raw = qrCodeUrl.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const data = url.searchParams.get('data');
    if (data?.trim()) return data.trim();
  } catch {
    // ignore
  }
  if (raw.includes('weixin.qq.com')) return raw;
  return raw;
}

/**
 * 规范化安全验证链接（CheckLoginStatus.VerificationUrl）
 * - 官方 weixin110 / 可用 http(s) 链接直接返回
 * - 失效第三方页（47.119...:5500）在有 ticket 时改写为官方入口，无 ticket 丢弃
 */
export function normalizeVerificationUrl(
  verificationUrl?: string,
  ticket?: string,
): string | undefined {
  const rawUrl = verificationUrl?.trim() || '';
  let secticket = ticket?.trim() || '';

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const fromQuery =
        parsed.searchParams.get('secticket') ||
        parsed.searchParams.get('ticket') ||
        '';
      if (fromQuery.trim()) secticket = fromQuery.trim();

      const deadHelper =
        parsed.hostname === '47.119.158.126' ||
        parsed.port === '5500' ||
        rawUrl.includes('47.119.158.126');

      if (deadHelper) {
        if (!secticket) return undefined;
      } else if (rawUrl.startsWith('http')) {
        return rawUrl;
      }
    } catch {
      // fall through
    }
  }

  if (!secticket) return undefined;

  return (
    'https://weixin110.qq.com/security/acct/extdevauthslavecgi' +
    `?t=extdevsignin%2Fslaveverify&ticket=${encodeURIComponent(secticket)}` +
    '&step=precheck&wechat_real_lang=zh_CN'
  );
}
