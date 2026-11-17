import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.mjs';

const COOKIE_NAME = 'monitoramento_session';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 1);

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([name]) => name)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join('='))]),
  );
}

export function getSessionToken(request) {
  return readCookies(request.headers.cookie)[COOKIE_NAME] || '';
}

export function setSessionCookie(response, token) {
  const maxAge = Math.max(1, SESSION_TTL_DAYS) * 24 * 60 * 60;
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: maxAge * 1000,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
}

// Sessões no banco. A fábrica permite testes com outro executor (ex.: PGlite);
// os exports abaixo mantêm a API usada pelas rotas.
export function createSessionStore(execute = query) {
  async function createSession(userId, options = {}) {
    const token = randomBytes(32).toString('base64url');
    const defaultExpiry = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Math.min(defaultExpiry, options.expiresAt ?? defaultExpiry));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())
      throw new Error('Expiração de sessão inválida.');

    // Limpeza oportunista: sessões expiradas não têm mais uso (índice em expires_at).
    await execute('delete from app_sessions where expires_at <= now()');
    await execute(
      `insert into app_sessions (token_hash, user_id, expires_at)
       values ($1, $2, $3)`,
      [hashToken(token), userId, expiresAt],
    );

    return token;
  }

  async function deleteSession(token) {
    if (token) {
      await execute('delete from app_sessions where token_hash = $1', [hashToken(token)]);
    }
  }

  // Encerra as demais sessões do usuário (ex.: após troca de senha).
  async function deleteOtherSessions(userId, currentToken, executor = execute) {
    await executor('delete from app_sessions where user_id = $1 and token_hash <> $2', [
      userId,
      hashToken(currentToken || ''),
    ]);
  }

  async function authenticateRequest(request) {
    const token = getSessionToken(request);

    if (!token) {
      return null;
    }

    const result = await execute(
      `select u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at
         from app_sessions s
         join app_users u on u.id = s.user_id
        where s.token_hash = $1
          and s.expires_at > now()
          and u.is_active = true`,
      [hashToken(token)],
    );

    return result.rows[0] ?? null;
  }

  async function requireUser(request, response, next) {
    try {
      const user = await authenticateRequest(request);

      if (!user) {
        response.status(401).json({ error: 'Sessão ausente ou expirada.' });
        return;
      }

      request.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  return { authenticateRequest, createSession, deleteOtherSessions, deleteSession, requireUser };
}

const defaultSessions = createSessionStore();
export const { authenticateRequest, createSession, deleteOtherSessions, deleteSession, requireUser } = defaultSessions;

export function requireAdmin(request, response, next) {
  if (request.user?.role !== 'admin') {
    response.status(403).json({ error: 'Acesso restrito a administradores.' });
    return;
  }

  next();
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// Quando o usuário não existe (ou não tem senha local), compara com um hash
// descartável de mesmo custo: o tempo de resposta não revela e-mails cadastrados.
let dummyHash;
export async function verifyPasswordOrDummy(password, passwordHash) {
  if (passwordHash) return verifyPassword(password, passwordHash);
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(password, await dummyHash);
  return false;
}

// bcrypt ignora silenciosamente o que passa de 72 bytes; recusa em vez de truncar.
export function passwordPolicyError(password) {
  if (password.length < 12) return 'A senha deve ter pelo menos 12 caracteres.';
  if (Buffer.byteLength(password, 'utf8') > 72)
    return 'A senha deve ter no máximo 72 bytes (cerca de 72 caracteres sem acentos).';
  return null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function publicUser(user) {
  return {
    created_at: user.created_at,
    email: user.email,
    full_name: user.full_name,
    id: user.id,
    role: user.role,
    updated_at: user.updated_at,
  };
}
