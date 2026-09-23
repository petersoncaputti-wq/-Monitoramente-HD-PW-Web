import type { AppRole, AuthSession, AuthUser, UserProfile } from '@/types/auth';

const SESSION_STORAGE_KEY = 'monitoramento-hd-pw.session';

interface AuthResponse {
  profile: UserProfile;
  user: AuthUser;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    let message = '';

    try {
      const parsed = JSON.parse(details) as { error?: string; message?: string };
      message = parsed.error || parsed.message || '';
    } catch {
      message = '';
    }

    throw new Error(message || details || `Erro HTTP ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function request(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

function toSession(result: AuthResponse): AuthSession {
  return {
    accessToken: 'cookie-session',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    refreshToken: 'cookie-session',
    user: result.user,
  };
}

export function saveStoredSession(session: AuthSession) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getStoredSession(): AuthSession | null {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const result = await parseResponse<AuthResponse>(
    await request('/api/auth/login', {
      body: JSON.stringify({ email, password }),
      method: 'POST',
    }),
  );
  const session = toSession(result);
  saveStoredSession(session);
  return session;
}

export async function refreshSession(_refreshToken: string): Promise<AuthSession> {
  const result = await parseResponse<AuthResponse>(await request('/api/auth/me'));
  const session = toSession(result);
  saveStoredSession(session);
  return session;
}

export async function getCurrentUser(_accessToken: string): Promise<AuthUser> {
  return (await parseResponse<AuthResponse>(await request('/api/auth/me'))).user;
}

export async function signOut(_accessToken: string) {
  await parseResponse<void>(await request('/api/auth/logout', { method: 'POST' }));
  clearStoredSession();
}

export async function getMyProfile(_accessToken: string, _userId: string): Promise<UserProfile> {
  return (await parseResponse<AuthResponse>(await request('/api/auth/me'))).profile;
}

export async function listUserProfiles(_accessToken: string): Promise<UserProfile[]> {
  return parseResponse<UserProfile[]>(await request('/api/admin-users'));
}

export async function updateUserRole(
  _accessToken: string,
  userId: string,
  role: AppRole,
): Promise<UserProfile> {
  return parseResponse<UserProfile>(
    await request('/api/admin-users', {
      body: JSON.stringify({ id: userId, role }),
      method: 'PATCH',
    }),
  );
}

export async function updateMyProfile(
  _accessToken: string,
  fullName: string,
): Promise<UserProfile> {
  return parseResponse<UserProfile>(
    await request('/api/auth/me', {
      body: JSON.stringify({ fullName }),
      method: 'PATCH',
    }),
  );
}

export async function updateMyPassword(_accessToken: string, password: string): Promise<void> {
  return parseResponse<void>(
    await request('/api/auth/password', {
      body: JSON.stringify({ password }),
      method: 'PATCH',
    }),
  );
}

async function adminUsersRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return parseResponse<T>(
    await request('/api/admin-users', {
      body: body ? JSON.stringify(body) : undefined,
      method,
    }),
  );
}

export async function listAdminUserProfiles(_accessToken: string): Promise<UserProfile[]> {
  return adminUsersRequest<UserProfile[]>('GET');
}

export async function createAdminUser(
  _accessToken: string,
  input: { email: string; fullName: string; password: string; role: AppRole },
): Promise<UserProfile> {
  return adminUsersRequest<UserProfile>('POST', input);
}

export async function updateAdminUser(
  _accessToken: string,
  input: { fullName: string; id: string; role: AppRole },
): Promise<UserProfile> {
  return adminUsersRequest<UserProfile>('PATCH', input);
}

export async function deleteAdminUser(_accessToken: string, id: string): Promise<{ id: string }> {
  return adminUsersRequest<{ id: string }>('DELETE', { id });
}
