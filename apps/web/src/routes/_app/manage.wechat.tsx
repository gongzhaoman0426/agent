import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Link2, QrCode, Smartphone, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import {
  useAgents,
  useConfirmWechatBind,
  useDeleteWechatAccount,
  useStartWechatLogin,
  useSubmitWechatVerifyCode,
  useUpdateWechatAccount,
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
  const submitCode = useSubmitWechatVerifyCode();
  const updateAccount = useUpdateWechatAccount();
  const deleteAccount = useDeleteWechatAccount();

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [qrContent, setQrContent] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [defaultAgentId, setDefaultAgentId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [binding, setBinding] = useState(false);
  const confirmedRef = useRef<string | null>(null);

  const { data: loginStatus } = useWechatLoginStatus(sessionKey);

  useEffect(() => {
    if (!defaultAgentId && agents?.length) {
      setDefaultAgentId(agents[0].id);
    }
  }, [agents, defaultAgentId]);

  // status 轮询可能刷新/更新二维码内容
  useEffect(() => {
    if (loginStatus?.qrcodeUrl) {
      setQrContent(loginStatus.qrcodeUrl);
    }
  }, [loginStatus?.qrcodeUrl]);

  // 本地生成二维码（不依赖外网短图服务）
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
    if (!loginStatus?.connected || !loginStatus.accountId || !loginStatus.botToken) {
      return;
    }
    if (!defaultAgentId || binding || confirmBind.isPending) return;
    const stamp = `${loginStatus.accountId}:${loginStatus.botToken}`;
    if (confirmedRef.current === stamp) return;
    confirmedRef.current = stamp;

    setBinding(true);
    setError('');
    void confirmBind
      .mutateAsync({
        defaultAgentId,
        accountId: loginStatus.accountId,
        token: loginStatus.botToken,
        baseUrl: loginStatus.baseUrl,
      })
      .then(() => {
        setSessionKey(null);
        setQrContent('');
        setQrDataUrl('');
        setVerifyCode('');
      })
      .catch((err: unknown) => {
        confirmedRef.current = null;
        setError(err instanceof Error ? err.message : '绑定失败');
      })
      .finally(() => setBinding(false));
  }, [binding, confirmBind, defaultAgentId, loginStatus]);

  const agentName = useMemo(() => {
    const map = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
    return (id: string) => map.get(id) ?? id;
  }, [agents]);

  const resetLogin = () => {
    setSessionKey(null);
    setQrContent('');
    setQrDataUrl('');
    setVerifyCode('');
    confirmedRef.current = null;
  };

  const handleStart = async () => {
    setError('');
    if (!defaultAgentId) {
      setError('请先选择默认智能体');
      return;
    }
    try {
      const result = await startLogin.mutateAsync();
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

  const handleVerify = async () => {
    if (!sessionKey || !verifyCode.trim()) return;
    setError('');
    try {
      await submitCode.mutateAsync({
        sessionKey,
        code: verifyCode.trim(),
      });
      setVerifyCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交配对码失败');
    }
  };

  return (
    <PageShell
      title="微信渠道"
      subtitle="扫码绑定个人微信，私聊消息会路由到选定的默认智能体；定时任务结果也会回传到微信。"
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold">扫码绑定</h2>
          </div>

          <label className="mb-1.5 block text-[13px] font-medium">
            默认智能体
          </label>
          <select
            className="mb-4 h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px]"
            value={defaultAgentId}
            onChange={(event) => setDefaultAgentId(event.target.value)}
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

          {!sessionKey ? (
            <Button
              onClick={() => void handleStart()}
              disabled={startLogin.isPending || !defaultAgentId}
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
                  {qrContent && (
                    <p className="break-all text-xs text-faint">{qrContent}</p>
                  )}
                  <Button size="sm" variant="ghost" onClick={resetLogin}>
                    取消
                  </Button>
                </div>
              </div>

              {loginStatus?.needVerifyCode && (
                <div className="flex max-w-sm items-center gap-2">
                  <Input
                    value={verifyCode}
                    onChange={(event) => setVerifyCode(event.target.value)}
                    placeholder="手机上显示的配对码"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleVerify()}
                    disabled={submitCode.isPending}
                  >
                    提交
                  </Button>
                </div>
              )}

              {(binding || confirmBind.isPending) && (
                <p className="text-[13px] text-muted-foreground">
                  扫码成功，正在绑定…
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
              description="生成二维码并用手机微信扫码连接"
            />
          ) : (
            <div className="space-y-2">
              {(accounts ?? []).map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                >
                  <EntityAvatar
                    seed={account.accountId}
                    icon={<Smartphone className="h-4 w-4" />}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {account.accountId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      默认智能体：{agentName(account.defaultAgentId)} ·{' '}
                      {account.enabled ? '监控中' : '已停用'}
                    </p>
                  </div>
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    value={account.defaultAgentId}
                    onChange={(event) =>
                      void updateAccount.mutateAsync({
                        id: account.id,
                        defaultAgentId: event.target.value,
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
                    onClick={() => void deleteAccount.mutateAsync(account.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
