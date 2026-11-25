import { clientIpKeyGenerator } from '../rate-limit-ip.mjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clearSessionCookie,
  createSessionStore,
  getSessionToken,
  hashPassword,
  passwordPolicyError,
  publicUser,
  setSessionCookie,
  verifyPasswordOrDummy,
} from '../auth.mjs';
import { query, withTransaction } from '../db.mjs';

const loginLimiter = rateLimit({
  keyGenerator: clientIpKeyGenerator,
  legacyHeaders: false,
  limit: 10,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
  standardHeaders: true,
  windowMs: 15 * 60 * 1000,
});

// Limita tentativas de adivinhar a senha atual a partir de uma sessão aberta.
const passwordLimiter = rateLimit({
  keyGenerator: (request) => `user:${request.user.id}`,
  legacyHeaders: false,
  limit: 10,
  message: { error: 'Muitas tentativas de troca de senha. Aguarde alguns minutos.' },
  standardHeaders: true,
  windowMs: 15 * 60 * 1000,
});

export function createAuthRouter({
  execute = query,
  transaction = withTransaction,
  sessions = createSessionStore(execute),
  loginThrottle = loginLimiter,
  passwordThrottle = passwordLimiter,
} = {}) {
  const router = Router();

  router.post('/login', loginThrottle, async (request, response) => {
    const email = String(request.body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(request.body?.password ?? '');

    if (!email || !password) {
      response.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    const result = await execute('select * from app_users where email = $1 and is_active = true', [email]);
    const user = result.rows[0];

    if (!(await verifyPasswordOrDummy(password, user?.password_hash))) {
      response.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    const token = await sessions.createSession(user.id);
    setSessionCookie(response, token);
    response.json({ profile: publicUser(user), user: { email: user.email, id: user.id } });
  });

  router.post('/logout', async (request, response) => {
    await sessions.deleteSession(getSessionToken(request));
    clearSessionCookie(response);
    response.status(204).end();
  });

  router.get('/me', sessions.requireUserPendingPasswordOk, (request, response) => {
    response.json({
      profile: publicUser(request.user),
      user: { email: request.user.email, id: request.user.id },
    });
  });

  router.patch('/me', sessions.requireUser, async (request, response) => {
    const fullName = String(request.body?.fullName ?? '').trim() || null;
    const result = await execute(`update app_users set full_name = $1, updated_at = now() where id = $2 returning *`, [
      fullName,
      request.user.id,
    ]);
    response.json(publicUser(result.rows[0]));
  });

  router.patch('/password', sessions.requireUserPendingPasswordOk, passwordThrottle, async (request, response) => {
    const currentPassword = String(request.body?.currentPassword ?? '');
    const password = String(request.body?.password ?? '');

    if (!currentPassword) {
      response.status(400).json({ error: 'Informe a senha atual.' });
      return;
    }

    const policyError = passwordPolicyError(password);
    if (policyError) {
      response.status(400).json({ error: policyError });
      return;
    }

    const current = await execute('select password_hash from app_users where id = $1', [request.user.id]);
    // 403 (e não 401): a sessão é válida; o frontend não deve tratar como logout.
    if (!(await verifyPasswordOrDummy(currentPassword, current.rows[0]?.password_hash))) {
      response.status(403).json({ error: 'Senha atual incorreta.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    await transaction(async (client) => {
      const run = (text, values) => client.query(text, values);
      await run(
        `update app_users set password_hash = $1, must_change_password = false, updated_at = now()
          where id = $2`,
        [passwordHash, request.user.id],
      );
      // Quem tinha uma sessão aberta (ex.: sessão roubada) perde o acesso.
      await sessions.deleteOtherSessions(request.user.id, getSessionToken(request), run);
    });
    response.status(204).end();
  });

  return router;
}

export default createAuthRouter();
