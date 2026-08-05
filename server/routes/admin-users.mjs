import { Router } from 'express';
import { hashPassword, publicUser, requireAdmin, requireUser } from '../auth.mjs';
import { query } from '../db.mjs';

const router = Router();
router.use(requireUser, requireAdmin);

router.get('/', async (_request, response) => {
  const result = await query('select * from app_users order by email asc');
  response.json(result.rows.map(publicUser));
});

router.post('/', async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const fullName = String(request.body?.fullName ?? '').trim() || null;
  const password = String(request.body?.password ?? '');
  const role = request.body?.role === 'admin' ? 'admin' : 'user';

  if (!email || password.length < 12) {
    response.status(400).json({ error: 'Informe um e-mail e uma senha com pelo menos 12 caracteres.' });
    return;
  }

  const result = await query(
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
  const result = await query(
    `update app_users set full_name = $1, role = $2, updated_at = now()
      where id = $3 returning *`,
    [fullName, role, id],
  );

  if (!result.rows[0]) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  response.json(publicUser(result.rows[0]));
});

router.delete('/', async (request, response) => {
  const id = String(request.body?.id ?? '').trim();

  if (id === request.user.id) {
    response.status(400).json({ error: 'Você não pode excluir o próprio usuário.' });
    return;
  }

  const result = await query('delete from app_users where id = $1 returning id', [id]);

  if (!result.rows[0]) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  response.json(result.rows[0]);
});

export default router;
