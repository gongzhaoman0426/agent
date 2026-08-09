import { useEffect, useState } from 'react';
import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
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

const OPERATOR_ALLOWED = new Set(['/wechat-inbox']);

function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [role, setRole] = useState(user?.role);

  useEffect(() => {
    void refreshStoredUser().then((u) => {
      if (!u) return;
      setRole(u.role);
      const path = window.location.pathname;
      if (u.role === 'operator' && !OPERATOR_ALLOWED.has(path)) {
        void navigate({
          to: '/wechat-inbox',
          search: { account: undefined, peer: undefined },
        });
      }
    });
  }, [navigate]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
      {role !== 'operator' && <ScheduleInboxToaster />}
    </div>
  );
}
