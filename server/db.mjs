import pg from 'pg';

const { Pool } = pg;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}.`);
  }

  return value;
}

function getCredentials({ migration = false } = {}) {
  const prefix = migration ? 'DB_MIGRATION_' : 'DB_';
  const user =
    process.env[`${prefix}USER`]?.trim() ||
    process.env.DB_USER?.trim() ||
    process.env.DB_MIGRATION_USER?.trim();
  const password =
    process.env[`${prefix}PASSWORD`] || process.env.DB_PASSWORD || process.env.DB_MIGRATION_PASSWORD;

  if (!user || !password) {
    throw new Error(
      migration
        ? 'Configure DB_MIGRATION_USER e DB_MIGRATION_PASSWORD.'
        : 'Configure DB_USER e DB_PASSWORD.',
    );
  }

  return { password, user };
}

export function createPool(options = {}) {
  const credentials = getCredentials(options);

  return new Pool({
    database: requireEnvironment('DB_NAME'),
    host: requireEnvironment('DB_HOST'),
    max: Number(process.env.DB_POOL_MAX || 10),
    password: credentials.password,
    port: Number(process.env.DB_PORT || 5432),
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
    user: credentials.user,
  });
}

let applicationPool;

export function getPool() {
  applicationPool ??= createPool();
  return applicationPool;
}

export async function query(text, values) {
  return getPool().query(text, values);
}

export async function withTransaction(callback, options = {}) {
  const pool = options.pool ?? getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
