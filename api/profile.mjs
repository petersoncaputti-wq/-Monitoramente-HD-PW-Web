import { requireUser } from './_auth.mjs';
import { query } from './_database.mjs';

export async function handleProfileRequest({ body = {}, headers = {}, method }) {
  const auth = await requireUser(headers);
  if (auth.error) return auth;
  if (method === 'GET') return { body: auth.profile, status: 200 };
  if (method === 'PATCH') {
    const fullName = String(body.fullName ?? '').trim() || null;
    const result = await query(
      `update app_profiles set full_name = $2 where id = $1
       returning id, email, full_name, role, created_at, updated_at`,
      [auth.caller.id, fullName],
    );
    return { body: result.rows[0], status: 200 };
  }
  return { error: 'Metodo nao permitido.', status: 405 };
}
