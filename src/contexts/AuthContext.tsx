import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthSession, UserProfile } from '@/types/auth';
import {
  clearStoredSession,
  getCurrentUser,
  getMyProfile,
  getStoredSession,
  refreshSession,
  saveStoredSession,
  signInWithPassword,
  signOut,
} from '@/services/supabaseRestClient';

interface AuthContextValue {
  accessToken: string | null;
  getValidAccessToken: () => Promise<string | null>;
  profile: UserProfile | null;
  session: AuthSession | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  setProfile: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  const loadProfile = useCallback(async (accessToken: string, userId: string) => {
    const loadedProfile = await getMyProfile(accessToken, userId);
    setProfile(loadedProfile);
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!session) {
      return;
    }

    await loadProfile(session.accessToken, session.user.id);
  }, [loadProfile, session]);

  const getValidAccessToken = useCallback(async () => {
    if (!session) {
      return null;
    }

    if (session.expiresAt - Date.now() >= 60_000) {
      return session.accessToken;
    }

    try {
      const refreshedSession = await refreshSession(session.refreshToken);
      const nextSession = {
        ...refreshedSession,
        user: refreshedSession.user.id ? refreshedSession.user : session.user,
      };

      saveStoredSession(nextSession);
      setSession(nextSession);
      return nextSession.accessToken;
    } catch {
      clearStoredSession();
      setSession(null);
      setProfile(null);
      setStatus('unauthenticated');
      return null;
    }
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedSession = getStoredSession();

      if (!storedSession) {
        if (isMounted) {
          setStatus('unauthenticated');
        }
        return;
      }

      try {
        const validSession =
          storedSession.expiresAt - Date.now() < 60_000
            ? await refreshSession(storedSession.refreshToken)
            : storedSession;
        const user = await getCurrentUser(validSession.accessToken);
        const nextSession = { ...validSession, user };

        saveStoredSession(nextSession);

        if (isMounted) {
          setSession(nextSession);
          await loadProfile(nextSession.accessToken, nextSession.user.id);
          setStatus('authenticated');
        }
      } catch {
        clearStoredSession();

        if (isMounted) {
          setSession(null);
          setProfile(null);
          setStatus('unauthenticated');
        }
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, [loadProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      setStatus('loading');

      try {
        const nextSession = await signInWithPassword(email, password);
        setSession(nextSession);
        await loadProfile(nextSession.accessToken, nextSession.user.id);
        setStatus('authenticated');
      } catch (error) {
        setStatus('unauthenticated');
        throw error;
      }
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    if (session) {
      await signOut(session.accessToken).catch(() => undefined);
    } else {
      clearStoredSession();
    }

    setSession(null);
    setProfile(null);
    setStatus('unauthenticated');
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: session?.accessToken ?? null,
      getValidAccessToken,
      login,
      logout,
      profile,
      reloadProfile,
      session,
      setProfile,
      status,
    }),
    [getValidAccessToken, login, logout, profile, reloadProfile, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de AuthProvider.');
  }

  return context;
}
