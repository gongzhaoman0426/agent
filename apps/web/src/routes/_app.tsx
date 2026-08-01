import { useEffect } from 'react';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { getStoredUser, refreshStoredUser } from '@/lib/auth';
import { ScheduleInboxToaster } from '@/components/schedule-inbox';
import { Sidebar } from '@/components/sidebar';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!getStoredUser()) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  useEffect(() => {
    // 后台校准 Cookie 会话（会话过期时由 API 401 兜底跳转）
    void refreshStoredUser();
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
      <ScheduleInboxToaster />
    </div>
  );
}
