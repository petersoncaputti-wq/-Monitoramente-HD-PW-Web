import type { AppRole, AuthSession, AuthUser, UserProfile } from '@/types/auth';

const SESSION_STORAGE_KEY = 'monitoramento-hd-pw.session';

interface SupabaseUserResponse {
  id: string;
  email?: string;
}

interface SignInResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUserResponse;
}

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  return { anonKey, url };
}

function mapUser(user: SupabaseUserResponse): AuthUser {
  return {
    email: user.email ?? '',
    id: user.id,
  };
}

function mapSession(response: SignInResponse): AuthSession {
  return {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshToken: response.refresh_token,
    user: mapUser(response.user),
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    let parsedMessage = '';

    try {
      const parsedDetails = JSON.parse(details) as { error?: string; message?: string; msg?: string };
      parsedMessage = parsedDetails.message || parsedDetails.error || parsedDetails.msg || '';
    } catch {
      parsedMessage = '';
    }

    throw new Error(parsedMessage || details || `Erro HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export function saveStoredSession(session: AuthSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getStoredSession(): AuthSession | null {
  const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const session = mapSession(await parseResponse<SignInResponse>(response));
  saveStoredSession(session);
  return session;
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const session = mapSession(await parseResponse<SignInResponse>(response));
  saveStoredSession(session);
  return session;
}

export async function getCurrentUser(accessToken: string): Promise<AuthUser> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return mapUser(await parseResponse<SupabaseUserResponse>(response));
}

export async function signOut(accessToken: string) {
  const { anonKey, url } = getSupabaseConfig();

  await fetch(`${url}/auth/v1/logout`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    method: 'POST',
  });

  clearStoredSession();
}

export async function getMyProfile(accessToken: string, userId: string): Promise<UserProfile> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/app_profiles?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const profiles = await parseResponse<UserProfile[]>(response);

  if (!profiles[0]) {
    throw new Error('Perfil de acesso não encontrado.');
  }

  return profiles[0];
}

export async function listUserProfiles(accessToken: string): Promise<UserProfile[]> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/app_profiles?select=*&order=email.asc`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseResponse<UserProfile[]>(response);
}

export async function updateUserRole(
  accessToken: string,
  userId: string,
  role: AppRole,
): Promise<UserProfile> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/app_profiles?id=eq.${encodeURIComponent(userId)}`, {
    body: JSON.stringify({ role }),
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    method: 'PATCH',
  });
  const profiles = await parseResponse<UserProfile[]>(response);

  if (!profiles[0]) {
    throw new Error('Usuário não encontrado.');
  }

  return profiles[0];
}

export async function updateMyProfile(
  accessToken: string,
  fullName: string,
): Promise<UserProfile> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/update_my_profile`, {
    body: JSON.stringify({ p_full_name: fullName }),
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return parseResponse<UserProfile>(response);
}

export async function updateMyPassword(accessToken: string, password: string): Promise<void> {
  const { anonKey, url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    body: JSON.stringify({ password }),
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });

  await parseResponse<unknown>(response);
}

async function adminUsersRequest<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await fetch('/api/admin-users', {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method,
  });

  return parseResponse<T>(response);
}

export async function listAdminUserProfiles(accessToken: string): Promise<UserProfile[]> {
  return adminUsersRequest<UserProfile[]>(accessToken, 'GET');
}

export async function createAdminUser(
  accessToken: string,
  input: { email: string; fullName: string; password: string; role: AppRole },
): Promise<UserProfile> {
  return adminUsersRequest<UserProfile>(accessToken, 'POST', input);
}

export async function updateAdminUser(
  accessToken: string,
  input: { fullName: string; id: string; role: AppRole },
): Promise<UserProfile> {
  return adminUsersRequest<UserProfile>(accessToken, 'PATCH', input);
}

export async function deleteAdminUser(accessToken: string, id: string): Promise<{ id: string }> {
  return adminUsersRequest<{ id: string }>(accessToken, 'DELETE', { id });
}
