import { createFileRoute, redirect } from '@tanstack/react-router';
import { getStoredUser } from '@/lib/auth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const user = getStoredUser();
    if (user?.role === 'operator') {
      throw redirect({
        to: '/wechat-inbox',
        search: { account: undefined, peer: undefined },
      });
    }
    throw redirect({
      to: '/chat',
      search: { session: undefined, agent: undefined },
    });
  },
});
