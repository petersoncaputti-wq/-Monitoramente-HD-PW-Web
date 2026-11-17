import { Router } from 'express';
import { hashPassword, passwordPolicyError, publicUser, requireAdmin, requireUser } from '../auth.mjs';
import { query, withTransaction } from '../db.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAST_ADMIN_ERROR = 'O sistema precisa de pelo menos um administrador ativo.';

class AdminUserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Bloqueia (FOR UPDATE) os admins ativos: duas alterações simultâneas não
// conseguem, juntas, deixar o sistema sem administrador.
async function assertKeepsAnAdmin(run, targetId) {
  const admins = await run(`select id from app_users where role = 'admin' and is_active = true order by id for update`);
  const targetIsAdmin = admins.rows.some((row) => row.id === targetId);
  if (targetIsAdmin && admins.rows.length <= 1) throw new AdminUserError(409, LAST_ADMIN_ERROR);
}

export function createAdminUsersRouter({
  execute = query,
  transaction = withTransaction,
  authenticate = requireUser,
  admin = requireAdmin,
} = {}) {
  const router = Router();
  router.use(authenticate, admin);

  router.get('/', async (_request, response) => {
    const result = await execute('select * from app_users order by email asc');
    response.json(result.rows.map(publicUser));
  });

  router.post('/', async (request, response) => {
    const email = String(request.body?.email ?? '')
      .trim()
      .toLowerCase();
    const fullName = String(request.body?.fullName ?? '').trim() || null;
    const password = String(request.body?.password ?? '');
    const role = request.body?.role === 'admin' ? 'admin' : 'user';

    const policyError = passwordPolicyError(password);
    if (!email || policyError) {
      response.status(400).json({ error: email ? policyError : 'Informe o e-mail do usuário.' });
      return;
    }

    const result = await execute(
      `insert into app_users (email, full_name, password_hash, role)
       values ($1, $2, $3, $4)
       returning *`,
      [email, fullName, await hashPassword(password), role],
    );
    response.status(201).json(publicUser(result.rows[0]));
  });

  router.patch('/', async (request, response) => {
    const id = String(request.body?.id ?? '').trim();
    const fullName = String(request.body?.fullName ?? '').trim() || null;
    const role = request.body?.role === 'admin' ? 'admin' : 'user';
    if (!UUID.test(id)) throw new AdminUserError(400, 'ID de usuário inválido.');

    const user = await transaction(async (client) => {
      const run = (text, values) => client.query(text, values);
      if (role !== 'admin') await assertKeepsAnAdmin(run, id);
      const result = await run(
        `update app_users set full_name = $1, role = $2, updated_at = now()
          where id = $3 returning *`,
        [fullName, role, id],
      );
      return result.rows[0];
    });

    if (!user) throw new AdminUserError(404, 'Usuário não encontrado.');
    response.json(publicUser(user));
  });

  router.delete('/', async (request, response) => {
    const id = String(request.body?.id ?? '').trim();
    if (!UUID.test(id)) throw new AdminUserError(400, 'ID de usuário inválido.');

    if (id === request.user.id) {
      response.status(400).json({ error: 'Você não pode excluir o próprio usuário.' });
      return;
    }

    const deleted = await transaction(async (client) => {
      const run = (text, values) => client.query(text, values);
      await assertKeepsAnAdmin(run, id);
      const result = await run('delete from app_users where id = $1 returning id', [id]);
      return result.rows[0];
    });

    if (!deleted) throw new AdminUserError(404, 'Usuário não encontrado.');
    response.json(deleted);
  });

  router.use((error, _request, response, next) => {
    if (error instanceof AdminUserError) return response.status(error.status).json({ error: error.message });
    if (error.code === '23505') return response.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    next(error);
  });

  return router;
}

export default createAdminUsersRouter();
