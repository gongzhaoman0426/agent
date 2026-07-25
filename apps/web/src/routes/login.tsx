import { useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Bot } from 'lucide-react';
import { authClient, setStoredUser } from '@/lib/auth';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const { data, error: err } = await authClient.signUp.email({
          // 用户名映射伪邮箱，与旧项目一致
          email: `${username}@agent.local`,
          password,
          name: username,
          username,
        });
        if (err) throw new Error(err.message || '注册失败');
        if (data?.user) {
          setStoredUser({
            id: data.user.id,
            name: data.user.name,
            username,
          });
        }
      } else {
        const { data, error: err } = await authClient.signIn.username({
          username,
          password,
        });
        if (err) throw new Error(err.message || '登录失败');
        if (data?.user) {
          setStoredUser({
            id: data.user.id,
            name: data.user.name,
            username,
          });
        }
      }
      navigate({ to: '/chat', search: { session: undefined, agent: undefined } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* 品牌区 */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-[oklch(0.35_0.16_275)] via-[oklch(0.45_0.2_285)] to-[oklch(0.5_0.19_310)] p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, oklch(0.7 0.15 310 / 0.4) 0%, transparent 45%), radial-gradient(circle at 80% 70%, oklch(0.6 0.18 250 / 0.5) 0%, transparent 50%)',
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Bot className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Agent Next
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-snug tracking-tight">
            构建你的
            <br />
            AI 智能体工作空间
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            挂载插件工具与工作流，上传技能包按需激活，基于 Mastra
            的记忆与语义召回让对话更懂上下文。
          </p>
        </div>
        <p className="relative text-xs text-white/40">
          Powered by Mastra · NestJS · TanStack Router
        </p>
      </div>

      {/* 表单区 */}
      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === 'login' ? '欢迎回来' : '创建账号'}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === 'login'
                ? '登录以继续使用你的智能体'
                : '注册一个新的工作空间账号'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium">
                用户名
              </label>
              <Input
                placeholder="输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
                className="h-10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium">
                密码
              </label>
              <Input
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-10"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </Button>
          </form>

          <button
            type="button"
            className="mt-5 w-full text-center text-[13px] text-muted-foreground transition-colors hover:text-primary"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？直接登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
