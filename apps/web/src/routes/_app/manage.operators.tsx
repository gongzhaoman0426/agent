import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Trash2, UserPlus } from 'lucide-react';
import {
  useCreateOperator,
  useDeleteOperator,
  useOperators,
  useUpdateOperator,
  useWechatAccounts,
} from '@/services/queries';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { EmptyState, PageShell } from '@/components/page-shell';

export const Route = createFileRoute('/_app/manage/operators')({
  component: OperatorsPage,
});

function OperatorsPage() {
  const { data: operators } = useOperators();
  const { data: accounts } = useWechatAccounts();
  const createOperator = useCreateOperator();
  const updateOperator = useUpdateOperator();
  const deleteOperator = useDeleteOperator();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const accountLabel = useMemo(() => {
    const map = new Map(
      (accounts ?? []).map((a) => [
        a.id,
        a.nickname || a.wxid,
      ]),
    );
    return (id: string) => map.get(id) || id;
  }, [accounts]);

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onCreate = async () => {
    setError('');
    try {
      await createOperator.mutateAsync({
        username: username.trim(),
        password,
        name: name.trim() || undefined,
        accountIds: selectedIds,
      });
      setUsername('');
      setPassword('');
      setName('');
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  return (
    <PageShell
      title="运营账号"
      subtitle="创建二类账号并勾选可管理的微信号；对方登录后只能进入微信工作台。若旧账号无法登录，请删除后按新流程重建。"
    >
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold">创建运营账号</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-faint">用户名</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="至少 2 位，支持中文/字母/数字"
                minLength={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-faint">显示名</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="可选，默认同用户名"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-faint">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-faint">
                勾选可管理的微信号
              </label>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2">
                {(accounts ?? []).length === 0 && (
                  <p className="px-2 py-3 text-xs text-faint">
                    还没有绑定微信号，请先去「微信绑定」
                  </p>
                )}
                {(accounts ?? []).map((acc) => {
                  const checked = selectedIds.includes(acc.id);
                  return (
                    <label
                      key={acc.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAccount(acc.id)}
                      />
                      <span className="min-w-0 truncate">
                        {acc.nickname || acc.wxid}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <Button
              className="w-full"
              disabled={
                !username.trim() ||
                password.length < 6 ||
                createOperator.isPending
              }
              onClick={() => void onCreate()}
            >
              创建并授权
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          {(operators ?? []).length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="还没有运营账号"
              description="创建后，对方用该账号登录只能看到微信工作台，并管理你勾选的微信号。"
            />
          ) : (
            (operators ?? []).map((op) => (
              <div
                key={op.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">{op.name}</p>
                    <p className="text-[12px] text-faint">@{op.username}</p>
                  </div>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    title="删除"
                    onClick={() => {
                      if (confirm(`确定删除运营账号 ${op.username}？`)) {
                        void deleteOperator.mutateAsync(op.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-[12px] text-faint">已授权微信号</p>
                  <div className="flex flex-wrap gap-2">
                    {(accounts ?? []).map((acc) => {
                      const checked = op.accountIds.includes(acc.id);
                      return (
                        <label
                          key={acc.id}
                          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? op.accountIds.filter((id) => id !== acc.id)
                                : [...op.accountIds, acc.id];
                              void updateOperator.mutateAsync({
                                id: op.id,
                                accountIds: next,
                              });
                            }}
                          />
                          {accountLabel(acc.id)}
                        </label>
                      );
                    })}
                    {(accounts ?? []).length === 0 && (
                      <span className="text-xs text-faint">无可用微信号</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </PageShell>
  );
}
