import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import { getPadCallbackBaseUrl } from './pad/config.js';
import { buildWebhookUrl, setForwardUrl } from './pad/forward.js';
import {
  checkLoginStatus,
  extractQrPayload,
  genAuthKey,
  getLoginQrCodeNewX,
  getOnlineProfile,
  normalizeVerificationUrl,
  verifyPhoneCode,
} from './pad/login.js';
import { getPadOnlineStatus } from './pad/status.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatMonitorService } from './wechat-monitor.service.js';

type LoginSession = {
  authKey: string;
  agentId: string;
  userId: string;
  proxy: string;
  way: string;
  qrPayload: string;
  status: 'wait' | 'scanned' | 'confirming' | 'confirmed' | 'expired' | 'error';
  wxid?: string;
  nickname?: string;
  verificationUrl?: string;
  needsPhoneCode?: boolean;
  message: string;
  createdAt: number;
};

@Injectable()
export class WechatLoginService {
  private readonly logger = new Logger(WechatLoginService.name);
  private readonly sessions = new Map<string, LoginSession>();

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly monitor: WechatMonitorService,
    private readonly agentService: AgentService,
  ) {}

  /**
   * v875 绑定流程：
   * 1) GenAuthKey1
   * 2) GetLoginQrCodeNewX（默认不传 Way；出验证时再传 harmony|mac|win）
   * 3) 轮询 CheckLoginStatus → online 后 GetProfile → 落库 + SetForward
   */
  async startLogin(input: {
    userId: string;
    agentId: string;
    proxy?: string;
    way?: string;
  }) {
    await this.agentService.findOwned(input.agentId, input.userId);

    const authKey = await genAuthKey(30);
    const way = input.way?.trim() || '';
    const qr = await getLoginQrCodeNewX({
      authKey,
      proxy: input.proxy,
      way: way || undefined,
    });
    const qrPayload = extractQrPayload(qr.QrCodeUrl || '');
    if (!qrPayload) {
      throw new BadRequestException('未拿到登录二维码，请重试');
    }

    const session: LoginSession = {
      authKey,
      agentId: input.agentId,
      userId: input.userId,
      proxy: input.proxy?.trim() || '',
      way,
      qrPayload,
      status: 'wait',
      message: way
        ? `请用手机微信扫码（设备类型 ${way}）`
        : '请用手机微信扫码（推荐首次不指定设备类型）',
      createdAt: Date.now(),
    };
    this.sessions.set(authKey, session);

    return {
      sessionKey: authKey,
      qrcodeUrl: qrPayload,
      message: session.message,
    };
  }

  async pollStatus(sessionKey: string) {
    const session = this.sessions.get(sessionKey.trim());
    if (!session) {
      return {
        status: 'none',
        message: '登录会话不存在或已过期，请重新生成二维码',
      };
    }

    try {
      const data = await checkLoginStatus(session.authKey);
      const state = Number(data.state ?? 0);
      const loginState = String(data.loginState ?? '').toLowerCase();
      const msg = data.msg?.trim() || '';

      session.verificationUrl = normalizeVerificationUrl(
        data.VerificationUrl,
        data.ticket,
      );
      session.needsPhoneCode = /验证码|手机验证|短信/.test(msg);

      if (data.wxid?.trim()) {
        session.wxid = data.wxid.trim();
        session.nickname = data.nick_name?.trim() || session.nickname || '';
      }
      if (data.nick_name?.trim() && !session.nickname) {
        session.nickname = data.nick_name.trim();
      }

      // 二维码过期（effective_time 耗尽且仍未扫码）
      if (
        state === 0 &&
        typeof data.effective_time === 'number' &&
        data.effective_time <= 0
      ) {
        session.status = 'expired';
        session.message = '二维码已过期，请重新生成';
        return this.snapshot(session, false);
      }

      // loginState=online → 长连接已上线（响应里可能暂无 wxid）
      // state=2 时再用 GetLoginStatus 兜底确认（部分响应不带 loginState）
      if (
        loginState === 'online' ||
        (await this.isReallyOnline(session, state))
      ) {
        await this.ensureProfile(session);
        if (session.wxid) {
          session.status = 'confirmed';
          session.message = '账号已登录，正在绑定…';
          return this.snapshot(session, true);
        }
        session.status = 'confirming';
        session.message = '账号已在线，正在获取微信 ID…';
        return this.snapshot(session, false);
      }

      if (state === 2) {
        session.status = 'confirming';
        if (session.needsPhoneCode) {
          session.message = msg || '需要提交手机验证码，请在下方输入后继续';
        } else if (session.verificationUrl) {
          session.message =
            '已扫码，请用手机浏览器打开下方安全验证链接完成验证…';
        } else {
          session.message =
            msg ||
            '已扫码，等待登录完成。若长时间无变化：取消后改用 harmony/mac/win 设备类型重试，异地请填 socks5 代理。';
        }
        return this.snapshot(session, false);
      }

      if (state === 1) {
        session.status = 'scanned';
        session.message = msg || '已扫码，请在手机上确认登录';
      } else if (state === 0) {
        session.status = 'wait';
        session.message = msg || '请用手机微信扫码';
      } else {
        session.message = msg || `扫码状态 state=${state}`;
      }

      return this.snapshot(session, false);
    } catch (error) {
      session.status = 'error';
      session.message =
        error instanceof Error ? error.message : '检测登录状态失败';
      return this.snapshot(session, false);
    }
  }

  /** POST /login/VerifiPhoneCode */
  async submitPhoneCode(input: {
    userId: string;
    sessionKey: string;
    code: string;
  }) {
    const session = this.sessions.get(input.sessionKey.trim());
    if (!session || session.userId !== input.userId) {
      throw new BadRequestException('登录会话无效');
    }
    const code = input.code.trim();
    if (!code) {
      throw new BadRequestException('请输入验证码');
    }
    await verifyPhoneCode(session.authKey, code);
    session.needsPhoneCode = false;
    session.message = '验证码已提交，继续等待登录…';
    return this.pollStatus(session.authKey);
  }

  async confirmBind(input: { userId: string; sessionKey: string }) {
    const session = this.sessions.get(input.sessionKey.trim());
    if (!session || session.userId !== input.userId) {
      throw new BadRequestException('登录会话无效');
    }

    const polled = await this.pollStatus(session.authKey);
    const connected =
      'connected' in polled && Boolean(polled.connected) && Boolean(session.wxid);
    if (!connected || !session.wxid) {
      throw new BadRequestException(
        polled.message || '微信尚未完成登录，请稍候或完成安全验证后再试',
      );
    }

    const account = await this.accounts.createFromLogin({
      userId: input.userId,
      agentId: session.agentId,
      authKey: session.authKey,
      wxid: session.wxid,
      nickname: session.nickname,
      proxy: session.proxy,
      deviceWay: session.way,
    });

    const callbackBase = getPadCallbackBaseUrl();
    if (callbackBase) {
      const webhookUrl = buildWebhookUrl(callbackBase, session.authKey);
      try {
        await setForwardUrl(session.authKey, webhookUrl);
        this.logger.log(`已设置消息转发 ${session.wxid} → ${webhookUrl}`);
      } catch (error) {
        this.logger.warn(
          `设置消息转发失败（仍可依赖 HttpSyncMsg 轮询）: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      this.logger.warn(
        '未配置 WECHAT_PAD_CALLBACK_BASE_URL，将用 GetRedisSyncMsg 轮询入站（HttpSyncMsg 在 v875 常为空）',
      );
    }

    this.sessions.delete(session.authKey);
    await this.monitor.reload();
    return account;
  }

  private snapshot(session: LoginSession, connected: boolean) {
    return {
      status: session.status,
      qrcodeUrl: session.qrPayload,
      connected,
      wxid: session.wxid,
      nickname: session.nickname,
      message: session.message,
      verificationUrl: session.verificationUrl,
      needsPhoneCode: session.needsPhoneCode,
    };
  }

  private async ensureProfile(session: LoginSession) {
    if (session.wxid) return;
    try {
      const profile = await getOnlineProfile(session.authKey);
      if (profile.wxid) session.wxid = profile.wxid;
      if (profile.nickname) session.nickname = profile.nickname;
    } catch (error) {
      this.logger.warn(
        `在线但拉取资料失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** CheckLoginStatus 未带 online 时，用 GetLoginStatus 二次确认 */
  private async isReallyOnline(
    session: LoginSession,
    state: number,
  ): Promise<boolean> {
    // 仅在已扫码/确认阶段探测，避免空闲轮询打爆接口
    if (
      state !== 2 &&
      session.status !== 'confirming' &&
      session.status !== 'scanned'
    ) {
      return false;
    }
    try {
      const status = await getPadOnlineStatus(session.authKey);
      return status.online;
    } catch {
      return false;
    }
  }
}
