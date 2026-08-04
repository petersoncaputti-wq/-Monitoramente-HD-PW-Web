import { requireAdmin } from './_auth.mjs';
import { query } from './_database.mjs';
import { supabaseAdminRequest } from './_supabase-admin.mjs';

const PROFILE_COLUMNS = 'id, email, full_name, role, created_at, updated_at';

function normalizeRole(value) {
  return value === 'admin' ? 'admin' : 'user';
}

function createdUser(response) {
  const user = response?.user ?? response;
  if (!user?.id) throw new Error('O Supabase nao retornou o ID do usuario criado.');
  return user;
}

async function listProfiles() {
  const result = await query(`select ${PROFILE_COLUMNS} from app_profiles order by email asc`);
  return { body: result.rows, status: 200 };
}

async function createUser(body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.fullName ?? '').trim() || null;
  const role = normalizeRole(body.role);
  if (!email || !password) return { error: 'Email e senha sao obrigatorios.', status: 400 };

  const user = createdUser(await supabaseAdminRequest('/auth/v1/admin/users', {
    body: JSON.stringify({ email, email_confirm: true, password, user_metadata: { full_name: fullName } }),
    method: 'POST',
  }));

  try {
    const result = await query(
      `insert into app_profiles (id, email, full_name, role)
       values ($1, $2, $3, $4) returning ${PROFILE_COLUMNS}`,
      [user.id, email, fullName, role],
    );
    return { body: result.rows[0], status: 201 };
  } catch (error) {
    await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      .catch(() => undefined);
    throw error;
  }
}

async function updateUser(body, caller) {
  const id = String(body.id ?? '').trim();
  const hasFullName = body.fullName !== undefined;
  const fullName = hasFullName ? (String(body.fullName).trim() || null) : null;
  const role = normalizeRole(body.role);
  if (!id) return { error: 'ID do usuario ausente.', status: 400 };
  if (id === caller.id && role !== 'admin') {
    return { error: 'Voce nao pode remover sua propria permissao de administrador.', status: 400 };
  }
  const result = await query(
    `update app_profiles set full_name = case when $4 then $2 else full_name end, role = $3 where id = $1
     returning ${PROFILE_COLUMNS}`,
    [id, fullName, role, hasFullName],
  );
  if (!result.rows[0]) return { error: 'Usuario nao encontrado.', status: 404 };
  if (hasFullName) {
    await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      body: JSON.stringify({ user_metadata: { full_name: fullName } }), method: 'PUT',
    }).catch(() => undefined);
  }
  return { body: result.rows[0], status: 200 };
}

async function deleteUser(body, caller) {
  const id = String(body.id ?? '').trim();
  if (!id) return { error: 'ID do usuario ausente.', status: 400 };
  if (id === caller.id) return { error: 'Voce nao pode excluir sua propria conta.', status: 400 };

  const selected = await query(`select ${PROFILE_COLUMNS} from app_profiles where id = $1`, [id]);
  const profile = selected.rows[0];
  if (!profile) return { error: 'Usuario nao encontrado.', status: 404 };
  await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await query('delete from app_profiles where id = $1', [id]);
  return { body: { id }, status: 200 };
}

export async function handleAdminUsersRequest({ body = {}, headers = {}, method }) {
  const auth = await requireAdmin(headers);
  if (auth.error) return auth;
  if (method === 'GET') return listProfiles();
  if (method === 'POST') return createUser(body);
  if (method === 'PATCH') return updateUser(body, auth.caller);
  if (method === 'DELETE') return deleteUser(body, auth.caller);
  return { error: 'Metodo nao permitido.', status: 405 };
}

export default async function handler(request, response) {
  try {
    const result = await handleAdminUsersRequest(request);
    response.status(result.status).json(result.error ? { error: result.error } : result.body);
  } catch (error) {
    const status = error?.code === '23505' ? 409 : 500;
    response.status(status).json({ error: status === 409 ? 'Email ja cadastrado.' : error.message });
  }
}
