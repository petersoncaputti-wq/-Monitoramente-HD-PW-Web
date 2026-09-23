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

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `insert into app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, $3)`,
    [hashToken(token), userId, expiresAt],
  );

  return token;
}

export async function deleteSession(token) {
  if (token) {
    await query('delete from app_sessions where token_hash = $1', [hashToken(token)]);
  }
}

export async function authenticateRequest(request) {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const result = await query(
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

export async function requireUser(request, response, next) {
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
