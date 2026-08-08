import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Link2, QrCode, Smartphone, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import {
  useAgents,
  useConfirmWechatBind,
  useDeleteWechatAccount,
  useStartWechatLogin,
  useUpdateWechatAccount,
  useVerifyWechatPhone,
  useWechatAccounts,
  useWechatLoginStatus,
} from '@/services/queries';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import {
  EmptyState,
  EntityAvatar,
  PageShell,
} from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/wechat')({
  component: WechatPage,
});

function WechatPage() {
  const { data: accounts } = useWechatAccounts();
  const { data: agents } = useAgents();
  const startLogin = useStartWechatLogin();
  const confirmBind = useConfirmWechatBind();
  const verifyPhone = useVerifyWechatPhone();
  const updateAccount = useUpdateWechatAccount();
  const deleteAccount = useDeleteWechatAccount();

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [qrContent, setQrContent] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [agentId, setAgentId] = useState('');
  const [proxy, setProxy] = useState('');
  const [way, setWay] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [error, setError] = useState('');
  const [binding, setBinding] = useState(false);
  const confirmedRef = useRef<string | null>(null);

  const { data: loginStatus } = useWechatLoginStatus(sessionKey);

  useEffect(() => {
    if (!agentId && agents?.length) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  useEffect(() => {
    if (loginStatus?.qrcodeUrl) {
      setQrContent(loginStatus.qrcodeUrl);
    }
  }, [loginStatus?.qrcodeUrl]);

  useEffect(() => {
    if (!qrContent) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(qrContent, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '二维码生成失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qrContent]);

  useEffect(() => {
    if (!loginStatus?.connected || !sessionKey) return;
    if (!agentId || binding || confirmBind.isPending) return;
    if (confirmedRef.current === sessionKey) return;
    confirmedRef.current = sessionKey;

    setBinding(true);
    setError('');
    void confirmBind
      .mutateAsync({ sessionKey })
      .then(() => {
        setSessionKey(null);
        setQrContent('');
        setQrDataUrl('');
      })
      .catch((err: unknown) => {
        confirmedRef.current = null;
        setError(err instanceof Error ? err.message : '绑定失败');
      })
      .finally(() => setBinding(false));
  }, [agentId, binding, confirmBind, loginStatus, sessionKey]);

  const agentName = useMemo(() => {
    const map = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
    return (id: string) => map.get(id) ?? id;
  }, [agents]);

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof accounts>>();
    for (const account of accounts ?? []) {
      const list = map.get(account.agentId) ?? [];
      list.push(account);
      map.set(account.agentId, list);
    }
    return [...map.entries()];
  }, [accounts]);

  const resetLogin = () => {
    setSessionKey(null);
    setQrContent('');
    setQrDataUrl('');
    setPhoneCode('');
    confirmedRef.current = null;
  };

  const handleVerifyPhone = async () => {
    if (!sessionKey || !phoneCode.trim()) return;
    setError('');
    try {
      await verifyPhone.mutateAsync({
        sessionKey,
        code: phoneCode.trim(),
      });
      setPhoneCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交验证码失败');
    }
  };

  const handleStart = async () => {
    setError('');
    if (!agentId) {
      setError('请先选择要绑定的智能体');
      return;
    }
    try {
      const result = await startLogin.mutateAsync({
        agentId,
        proxy: proxy.trim() || undefined,
        way: way.trim() || undefined,
      });
      if (!result.qrcodeUrl) {
        setError(result.message || '未拿到二维码内容，请重试');
        return;
      }
      setSessionKey(result.sessionKey);
      setQrContent(result.qrcodeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动登录失败');
    }
  };

  return (
    <PageShell
      title="微信渠道"
      subtitle="对接 wechat-v875（GetLoginQrCodeNewX）。私聊文本路由到智能体；图片/语音需挂载「微信媒体」工具包。"
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold">添加微信号</h2>
          </div>

          <label className="mb-1.5 block text-[13px] font-medium">
            绑定到智能体
          </label>
          <select
            className="mb-3 h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px]"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            disabled={Boolean(sessionKey)}
          >
            {(agents ?? []).length === 0 && (
              <option value="">请先创建智能体</option>
            )}
            {(agents ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          <label className="mb-1.5 block text-[13px] font-medium">
            设备类型 Way（可选）
          </label>
          <select
            className="mb-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px]"
            value={way}
            onChange={(event) => setWay(event.target.value)}
            disabled={Boolean(sessionKey)}
          >
            <option value="">不传（推荐首次）</option>
            <option value="harmony">harmony（出验证时常用）</option>
            <option value="mac">mac</option>
            <option value="win">win</option>
            <option value="ipad">ipad</option>
          </select>
          <p className="mb-3 text-xs text-muted-foreground">
            v875 文档：首次勿传 Way；若出现安全验证，取消后改选 harmony/mac/win
            再扫。
          </p>

          <label className="mb-1.5 block text-[13px] font-medium">
            代理（可选，异地服务器建议填写）
          </label>
          <Input
            className="mb-4"
            value={proxy}
            onChange={(event) => setProxy(event.target.value)}
            placeholder="socks5://user:pass@host:port"
            disabled={Boolean(sessionKey)}
          />

          {!sessionKey ? (
            <Button
              onClick={() => void handleStart()}
              disabled={startLogin.isPending || !agentId}
            >
              {startLogin.isPending ? '生成中…' : '生成二维码'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="微信登录二维码"
                    className="h-[220px] w-[220px] rounded-lg border border-border bg-white p-2"
                  />
                ) : (
                  <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    二维码生成中…
                  </div>
                )}
                <div className="space-y-2 text-[13px] text-muted-foreground">
                  <p>{loginStatus?.message || '请用手机微信扫码'}</p>
                  {loginStatus?.nickname && (
                    <p>扫码账号：{loginStatus.nickname}</p>
                  )}
                  {loginStatus?.verificationUrl && (
                    <div className="space-y-1 text-xs">
                      <p className="text-amber-600">
                        请用手机浏览器打开安全验证（CheckLoginStatus.VerificationUrl）：
                      </p>
                      <a
                        className="break-all text-primary underline"
                        href={loginStatus.verificationUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {loginStatus.verificationUrl}
                      </a>
                    </div>
                  )}
                  {loginStatus?.needsPhoneCode && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-36"
                        value={phoneCode}
                        onChange={(event) => setPhoneCode(event.target.value)}
                        placeholder="手机验证码"
                      />
                      <Button
                        size="sm"
                        disabled={
                          !phoneCode.trim() || verifyPhone.isPending
                        }
                        onClick={() => void handleVerifyPhone()}
                      >
                        {verifyPhone.isPending ? '提交中…' : '提交验证码'}
                      </Button>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetLogin}>
                    取消
                  </Button>
                </div>
              </div>

              {loginStatus?.status === 'confirming' &&
                !binding &&
                (loginStatus?.verificationUrl ||
                  loginStatus?.needsPhoneCode) && (
                  <p className="text-[13px] text-amber-600">
                    完成验证后系统会自动继续绑定，无需刷新
                  </p>
                )}
              {(binding || confirmBind.isPending) && (
                <p className="text-[13px] text-muted-foreground">
                  长连接已上线，正在绑定…
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 text-[13px] text-destructive">{error}</p>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold">已绑定账号</h2>
          </div>

          {(accounts ?? []).length === 0 ? (
            <EmptyState
              icon={<QrCode className="h-5 w-5" />}
              title="尚未绑定微信"
              description="选择智能体后生成二维码，用手机微信扫码即可（同一智能体可绑多个号）"
            />
          ) : (
            <div className="space-y-6">
              {grouped.map(([groupAgentId, rows]) => (
                <div key={groupAgentId} className="space-y-2">
                  <p className="text-[13px] font-medium text-muted-foreground">
                    {agentName(groupAgentId)}
                  </p>
                  {rows.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                    >
                      <EntityAvatar
                        seed={account.wxid}
                        icon={<Smartphone className="h-4 w-4" />}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {account.nickname || account.wxid}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            account.wxid,
                            account.deviceWay || null,
                            account.proxy ? '代理' : null,
                            account.enabled ? '监控中' : '已停用',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <select
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                        value={account.agentId}
                        onChange={(event) =>
                          void updateAccount.mutateAsync({
                            id: account.id,
                            agentId: event.target.value,
                          })
                        }
                      >
                        {(agents ?? []).map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void updateAccount.mutateAsync({
                            id: account.id,
                            enabled: !account.enabled,
                          })
                        }
                      >
                        {account.enabled ? '停用' : '启用'}
                      </Button>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        title="解绑"
                        onClick={() =>
                          void deleteAccount.mutateAsync(account.id)
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
