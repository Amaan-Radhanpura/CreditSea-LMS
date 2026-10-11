'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { UserDTO } from '@lms/shared';
import { api } from '@/lib/api';
import { homeFor } from '@/lib/routes';

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  /** Called after login/register: stores the user and goes to their home page. */
  signedIn: (user: UserDTO, next?: string | null) => void;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile edit. */
  updateUser: (user: UserDTO) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const PUBLIC_PATHS = ['/', '/login', '/register'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Only re-check the session when moving between the public and private areas.
  useEffect(() => {
    if (isPublic) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: UserDTO }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [isPublic]);

  const signedIn = useCallback(
    (u: UserDTO, next?: string | null) => {
      setUser(u);
      router.replace(next && next.startsWith('/') ? next : homeFor(u.role));
      router.refresh();
    },
    [router],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
    router.replace('/login');
    router.refresh();
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, signedIn, logout, updateUser: setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
