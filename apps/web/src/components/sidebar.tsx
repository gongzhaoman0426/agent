import { Link, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Inbox,
  LogOut,
  MessagesSquare,
  Smartphone,
  Sparkles,
  UserPlus,
  Workflow as WorkflowIcon,
  Wrench,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient, getStoredUser, setStoredUser } from '@/lib/auth';

const builderSections = [
  {
    label: null,
    links: [
      { to: '/chat', label: '试聊', icon: MessagesSquare },
      { to: '/wechat-inbox', label: '微信工作台', icon: Inbox },
    ],
  },
  {
    label: '构建',
    links: [
      { to: '/manage/agents', label: '智能体', icon: Bot },
      { to: '/manage/skills', label: '技能', icon: Sparkles },
      { to: '/manage/toolkits', label: '插件工具', icon: Wrench },
      { to: '/manage/workflows', label: '工作流', icon: WorkflowIcon },
      { to: '/manage/wechat', label: '微信绑定', icon: Smartphone },
      { to: '/manage/operators', label: '运营账号', icon: UserPlus },
    ],
  },
] as const;

const operatorSections = [
  {
    label: null,
    links: [{ to: '/wechat-inbox', label: '微信工作台', icon: Inbox }],
  },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const displayName = user?.username || user?.name || '未登录';
  const isOperator = user?.role === 'operator';
  const navSections = isOperator ? operatorSections : builderSections;

  const handleLogout = async () => {
    await authClient.signOut().catch(() => undefined);
    setStoredUser(null);
    queryClient.clear();
    navigate({ to: '/login' });
  };

  return (
    <aside className="flex h-full w-[216px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-[oklch(0.6_0.2_305)] text-sm font-bold text-white shadow-sm">
          A
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">Agent Next</p>
          <p className="text-[11px] text-faint">
            {isOperator ? '微信运营工作台' : '个人工作空间'}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3">
        {navSections.map((section, index) => (
          <div key={index}>
            {section.label && (
              <p className="mb-1 px-3 text-[11px] font-medium tracking-wide text-faint">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.links.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-primary-soft [&.active]:text-primary"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">
              {displayName}
            </span>
            <span className="block text-[10px] text-faint">
              {isOperator ? '运营账号' : '搭建账号'}
            </span>
          </div>
          <button
            onClick={() => void handleLogout()}
            title="退出登录"
            className="rounded-md p-1.5 text-faint opacity-0 transition-all hover:bg-border/60 hover:text-foreground group-hover:opacity-100"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
