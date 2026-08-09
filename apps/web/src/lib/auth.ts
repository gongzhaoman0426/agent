import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  basePath: '/api/auth',
  plugins: [usernameClient()],
});

export type UserRole = 'builder' | 'operator';

export interface AuthUser {
  id: string;
  name: string;
  username?: string;
  role?: UserRole;
}

const AUTH_USER_KEY = 'agent-next:auth-user';

/** localStorage 镜像，供路由 beforeLoad 同步判断登录态 */
export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

async function fetchProfile(): Promise<Pick<AuthUser, 'role' | 'username' | 'name' | 'id'> | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as {
      id: string;
      name: string;
      username: string;
      role: UserRole;
    };
  } catch {
    return null;
  }
}

/** 启动时校准登录态（Cookie 会话是事实来源） */
export async function refreshStoredUser(): Promise<AuthUser | null> {
  try {
    const { data } = await authClient.getSession();
    if (data?.user) {
      const profile = await fetchProfile();
      const user: AuthUser = {
        id: profile?.id || data.user.id,
        name: profile?.name || data.user.name,
        username:
          profile?.username ||
          (data.user as { username?: string }).username ||
          undefined,
        role: profile?.role === 'operator' ? 'operator' : 'builder',
      };
      setStoredUser(user);
      return user;
    }
    setStoredUser(null);
    return null;
  } catch {
    return getStoredUser();
  }
}
