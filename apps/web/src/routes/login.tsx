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
    <div className="flex h-full items-center justify-center bg-muted/50">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Agent Next</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? '登录你的账号' : '创建新账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
          />
          <Input
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
    </div>
  );
}
