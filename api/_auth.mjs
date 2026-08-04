import { query } from './_database.mjs';

function getSupabaseAuthConfig() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !publishableKey) throw new Error('Configuracao do Supabase Auth ausente.');
  return { publishableKey, url };
}

function bearerToken(headers) {
  const authorization = headers.authorization ?? headers.Authorization ?? '';
  return String(authorization).replace(/^Bearer\s+/i, '').trim();
}

export async function getSupabaseUser(headers) {
  const accessToken = bearerToken(headers);
  if (!accessToken) return null;
  const { publishableKey, url } = getSupabaseAuthConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Falha ao validar sessao no Supabase (${response.status}).`);
  return response.json();
}

export async function requireUser(headers) {
  const caller = await getSupabaseUser(headers);
  if (!caller?.id) return { error: 'Sessao ausente ou expirada.', status: 401 };
  const result = await query(
    `select id, email, full_name, role, created_at, updated_at
       from app_profiles where id = $1 limit 1`,
    [caller.id],
  );
  const profile = result.rows[0];
  if (!profile) return { error: 'Perfil de acesso nao encontrado.', status: 403 };
  return { caller, profile };
}

export async function requireAdmin(headers) {
  const auth = await requireUser(headers);
  if (auth.error) return auth;
  return auth.profile.role === 'admin'
    ? auth
    : { error: 'Acesso restrito a administradores.', status: 403 };
}
