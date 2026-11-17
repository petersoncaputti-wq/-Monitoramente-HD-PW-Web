export type AppRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  /** Senha redefinida pelo admin: o usuário precisa trocá-la antes de usar o painel. */
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}
