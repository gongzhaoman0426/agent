import { Link, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Boxes,
  LogOut,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
  Wrench,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient, getStoredUser, setStoredUser } from '@/lib/auth';
import { useDeleteSession, useSessions } from '@/services/queries';
import { Button } from '@/ui/button';
import { cn } from '@/lib/utils';

const manageLinks = [
  { to: '/manage/agents', label: '智能体', icon: Bot },
  { to: '/manage/toolkits', label: '工具包', icon: Wrench },
  { to: '/manage/workflows', label: '工作流', icon: WorkflowIcon },
  { to: '/manage/skills', label: '技能', icon: Sparkles },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sessions } = useSessions();
  const deleteSession = useDeleteSession();
  const user = getStoredUser();

  const handleLogout = async () => {
    await authClient.signOut().catch(() => undefined);
    setStoredUser(null);
    queryClient.clear();
    navigate({ to: '/login' });
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes className="h-4 w-4" />
        </div>
        <span className="font-semibold">Agent Next</span>
      </div>

      <div className="px-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() =>
            navigate({
              to: '/chat',
              search: { session: undefined, agent: undefined },
            })
          }
        >
          <MessageSquarePlus className="h-4 w-4" />
          新对话
        </Button>
      </div>

      <nav className="mt-4 space-y-0.5 px-3">
        {manageLinks.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
          历史会话
        </p>
        {(sessions ?? []).map((session) => (
          <div
            key={session.id}
            className={cn(
              'group flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted',
            )}
          >
            <Link
              to="/chat"
              search={{ session: session.id, agent: session.agentId }}
              className="min-w-0 flex-1 truncate text-left"
              title={session.title}
            >
              <span className="block truncate">{session.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {session.agentName}
              </span>
            </Link>
            <button
              className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
              onClick={() => deleteSession.mutate(session.id)}
              title="删除会话"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="truncate text-sm text-muted-foreground">
          {user?.username || user?.name || '未登录'}
        </span>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
