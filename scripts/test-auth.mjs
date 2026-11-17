import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { createSessionStore, hashPassword, requireAdmin } from '../server/auth.mjs';
import { createAuthRouter } from '../server/routes/auth.mjs';
import { createAdminUsersRouter } from '../server/routes/admin-users.mjs';

// Usa o schema real de usuários/sessões (trecho inicial de azure/schema.sql).
const schema = readFileSync(new URL('../azure/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(schema.slice(0, schema.indexOf('create table if not exists storage_imports')));

const execute = (text, values) => db.query(text, values);
const transaction = async (callback) => {
  await db.exec('begin');
  try {
    const result = await callback({ query: execute });
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
};
const pass = (_req, _res, next) => next();
const sessions = createSessionStore(execute);

const app = express();
app.use(express.json());
app.use('/auth', createAuthRouter({ execute, transaction, sessions, loginThrottle: pass, passwordThrottle: pass }));
app.use(
  '/admin-users',
  createAdminUsersRouter({ execute, transaction, authenticate: sessions.requireUser, admin: requireAdmin }),
);
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'interno' });
});
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, { body, cookie } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });
const elapsed = async (fn) => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};

const ADMIN_PASSWORD = 'senha-admin-forte-123';
const insertUser = async (email, role, password = ADMIN_PASSWORD) =>
  (
    await execute('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
      email,
      await hashPassword(password),
      role,
    ])
  ).rows[0].id;

try {
  const adminId = await insertUser('admin@teste.local', 'admin');
  const userId = await insertUser('usuario@teste.local', 'user');

  // 1. Login: e-mail inexistente custa o mesmo bcrypt que senha errada.
  assert.equal((await login('admin@teste.local', 'errada')).status, 401);
  assert.equal((await login('ninguem@teste.local', 'errada')).status, 401); // aquece o hash descartável
  const wrongPasswordMs = await elapsed(() => login('admin@teste.local', 'errada'));
  const unknownEmailMs = await elapsed(() => login('ninguem@teste.local', 'errada'));
  assert.ok(
    unknownEmailMs > wrongPasswordMs * 0.5,
    `e-mail inexistente respondeu rápido demais (${unknownEmailMs.toFixed(0)}ms vs ${wrongPasswordMs.toFixed(0)}ms)`,
  );

  // 2. Sessões expiradas são removidas no próximo login.
  await execute(
    `insert into app_sessions (token_hash, user_id, expires_at) values ('expirada', $1, now() - interval '1 day')`,
    [userId],
  );
  const first = await login('admin@teste.local', ADMIN_PASSWORD);
  assert.equal(first.status, 200);
  assert.equal(
    (await execute(`select count(*)::int as n from app_sessions where token_hash = 'expirada'`)).rows[0].n,
    0,
  );
  const second = await login('admin@teste.local', ADMIN_PASSWORD);
  assert.equal((await call('GET', '/auth/me', { cookie: second.cookie })).status, 200);

  // 3. Troca de senha exige a senha atual e respeita a política.
  const change = (cookie, body) => call('PATCH', '/auth/password', { cookie, body });
  const NEW_PASSWORD = 'nova-senha-muito-forte-456';
  assert.equal((await change(first.cookie, { password: NEW_PASSWORD })).status, 400);
  const wrong = await change(first.cookie, { currentPassword: 'chute', password: NEW_PASSWORD });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, 'Senha atual incorreta.');
  assert.equal((await change(first.cookie, { currentPassword: ADMIN_PASSWORD, password: 'curta' })).status, 400);
  assert.equal((await change(first.cookie, { currentPassword: ADMIN_PASSWORD, password: 'a'.repeat(73) })).status, 400);
  assert.equal((await change(undefined, { currentPassword: ADMIN_PASSWORD, password: NEW_PASSWORD })).status, 401);
  assert.equal((await change(first.cookie, { currentPassword: ADMIN_PASSWORD, password: NEW_PASSWORD })).status, 204);

  // 4. Depois da troca: só a sessão atual continua válida.
  assert.equal((await call('GET', '/auth/me', { cookie: first.cookie })).status, 200);
  assert.equal((await call('GET', '/auth/me', { cookie: second.cookie })).status, 401);
  assert.equal((await login('admin@teste.local', ADMIN_PASSWORD)).status, 401);
  assert.equal((await login('admin@teste.local', NEW_PASSWORD)).status, 200);

  // 5. Último admin não pode ser rebaixado nem excluído.
  const adminCookie = first.cookie;
  const demoteSelf = await call('PATCH', '/admin-users', { cookie: adminCookie, body: { id: adminId, role: 'user' } });
  assert.equal(demoteSelf.status, 409);
  assert.match(demoteSelf.body.error, /pelo menos um administrador/);
  assert.equal((await call('DELETE', '/admin-users', { cookie: adminCookie, body: { id: adminId } })).status, 400);

  // 6. Com um segundo admin, rebaixar o primeiro é permitido.
  const created = await call('POST', '/admin-users', {
    cookie: adminCookie,
    body: { email: 'admin2@teste.local', password: 'outra-senha-forte-789', role: 'admin' },
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await call('POST', '/admin-users', {
        cookie: adminCookie,
        body: { email: 'admin2@teste.local', password: 'outra-senha-forte-789' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await call('POST', '/admin-users', { cookie: adminCookie, body: { email: 'x@teste.local', password: 'curta' } }))
      .status,
    400,
  );
  assert.equal(
    (await call('PATCH', '/admin-users', { cookie: adminCookie, body: { id: adminId, role: 'user' } })).status,
    200,
  );
  assert.equal(
    (await call('GET', '/admin-users', { cookie: adminCookie })).status,
    403,
    'rebaixado perde acesso imediatamente',
  );

  // 7. O novo admin agora é o único: também protegido.
  const admin2 = await login('admin2@teste.local', 'outra-senha-forte-789');
  assert.equal(
    (await call('PATCH', '/admin-users', { cookie: admin2.cookie, body: { id: created.body.id, role: 'user' } }))
      .status,
    409,
  );
  assert.equal(
    (await call('PATCH', '/admin-users', { cookie: admin2.cookie, body: { id: 'nao-e-uuid', role: 'user' } })).status,
    400,
  );
  assert.equal(
    (await call('DELETE', '/admin-users', { cookie: admin2.cookie, body: { id: 'nao-e-uuid' } })).status,
    400,
  );
  assert.equal(
    (
      await call('PATCH', '/admin-users', {
        cookie: admin2.cookie,
        body: { id: '00000000-0000-4000-8000-000000000000', role: 'user' },
      })
    ).status,
    404,
  );
  assert.equal((await call('DELETE', '/admin-users', { cookie: admin2.cookie, body: { id: userId } })).status, 200);
  const remainingAdmins = await execute(`select count(*)::int as n from app_users where role = 'admin' and is_active`);
  assert.equal(remainingAdmins.rows[0].n, 1);
} finally {
  server.close();
  await db.close();
}

console.log(
  'Auth: senha atual obrigatória, encerramento de outras sessões, política de senha, tempo constante no login, limpeza de sessões expiradas e proteção do último admin: OK.',
);
