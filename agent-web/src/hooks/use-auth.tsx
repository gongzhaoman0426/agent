import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { authClient } from '../lib/auth-client';

const USER_KEY = 'auth_user';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function toAuthEmail(username: string): string {
  const bytes = new TextEncoder().encode(username);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encoded}@agent.local`;
}

function getErrorMessage(error: { message?: string; status?: number } | null, fallback: string) {
  if (!error) return fallback;

  if (error.status === 409) {
    return '用户名已存在';
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function normalizeUser(
  authUser: { id: string; username?: string | null; name?: string | null; email?: string | null },
  fallbackUsername = '',
): User {
  return {
    id: authUser.id,
    username: authUser.username || authUser.name || authUser.email || fallbackUsername,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  // 启动时用 better-auth session 校准本地用户态
  useEffect(() => {
    let isActive = true;

    void authClient.getSession()
      .then(({ data }) => {
        if (!isActive) return;

        if (!data?.user) {
          setUser(null);
          localStorage.removeItem(USER_KEY);
          return;
        }

        const normalizedUser = normalizeUser(data.user);
        setUser(normalizedUser);
        localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
      })
      .catch(() => {
        if (!isActive) return;
        setUser(null);
        localStorage.removeItem(USER_KEY);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleAuthResponse = useCallback((
    authUser: { id: string; username?: string | null; name?: string | null; email?: string | null },
    fallbackUsername: string,
  ) => {
    const normalizedUser = normalizeUser(authUser, fallbackUsername);
    setUser(normalizedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(normalizedUser));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const normalizedUsername = username.trim();
    const { data, error } = await authClient.signIn.username({
      username: normalizedUsername,
      password,
    });

    if (error || !data?.token || !data.user) {
      throw new Error(getErrorMessage(error, '登录失败'));
    }

    handleAuthResponse(data.user, normalizedUsername);
  }, [handleAuthResponse]);

  const register = useCallback(async (username: string, password: string) => {
    const normalizedUsername = username.trim();
    const { data, error } = await authClient.signUp.email({
      name: normalizedUsername,
      username: normalizedUsername,
      email: toAuthEmail(normalizedUsername),
      password,
    });

    if (error || !data?.token || !data.user) {
      throw new Error(getErrorMessage(error, '注册失败'));
    }

    handleAuthResponse(data.user, normalizedUsername);
  }, [handleAuthResponse]);

  const logout = useCallback(() => {
    void authClient.signOut();
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
