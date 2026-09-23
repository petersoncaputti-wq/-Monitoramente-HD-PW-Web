import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionToken,
  hashPassword,
  publicUser,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from '../auth.mjs';
import { query } from '../db.mjs';

const router = Router();
const loginLimiter = rateLimit({
  legacyHeaders: false,
  limit: 10,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
  standardHeaders: true,
  windowMs: 15 * 60 * 1000,
});

router.post('/login', loginLimiter, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const password = String(request.body?.password ?? '');

  if (!email || !password) {
    response.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }

  const result = await query('select * from app_users where email = $1 and is_active = true', [email]);
  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    response.status(401).json({ error: 'E-mail ou senha inválidos.' });
    return;
  }

  const token = await createSession(user.id);
  setSessionCookie(response, token);
  response.json({ profile: publicUser(user), user: { email: user.email, id: user.id } });
});

router.post('/logout', async (request, response) => {
  await deleteSession(getSessionToken(request));
  clearSessionCookie(response);
  response.status(204).end();
});

router.get('/me', requireUser, (request, response) => {
  response.json({
    profile: publicUser(request.user),
    user: { email: request.user.email, id: request.user.id },
  });
});

router.patch('/me', requireUser, async (request, response) => {
  const fullName = String(request.body?.fullName ?? '').trim() || null;
  const result = await query(
    `update app_users set full_name = $1, updated_at = now() where id = $2 returning *`,
    [fullName, request.user.id],
  );
  response.json(publicUser(result.rows[0]));
});

router.patch('/password', requireUser, async (request, response) => {
  const password = String(request.body?.password ?? '');

  if (password.length < 12) {
    response.status(400).json({ error: 'A senha deve ter pelo menos 12 caracteres.' });
    return;
  }

  await query(
    `update app_users set password_hash = $1, updated_at = now() where id = $2`,
    [await hashPassword(password), request.user.id],
  );
  response.status(204).end();
});

export default router;
