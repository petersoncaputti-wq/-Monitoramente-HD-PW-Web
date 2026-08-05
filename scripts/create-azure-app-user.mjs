import { createPool } from '../server/db.mjs';

const role = process.env.DB_APP_USER?.trim();
const password = process.env.DB_APP_PASSWORD ?? '';
const database = process.env.DB_NAME?.trim();

if (!role || !/^[a-z][a-z0-9_]{2,62}$/.test(role)) {
  throw new Error('DB_APP_USER deve conter apenas letras minúsculas, números e sublinhado.');
}

if (password.length < 24) {
  throw new Error('DB_APP_PASSWORD deve ter pelo menos 24 caracteres.');
}

if (!database) {
  throw new Error('DB_NAME não está configurado.');
}

const identifier = `"${role.replaceAll('"', '""')}"`;
const databaseIdentifier = `"${database.replaceAll('"', '""')}"`;
const passwordLiteral = `'${password.replaceAll("'", "''")}'`;
const pool = createPool({ migration: true });

try {
  const exists = await pool.query('select 1 from pg_roles where rolname = $1', [role]);
  if (exists.rowCount) {
    await pool.query(`alter role ${identifier} with login password ${passwordLiteral} nosuperuser nocreatedb nocreaterole noreplication`);
  } else {
    await pool.query(`create role ${identifier} with login password ${passwordLiteral} nosuperuser nocreatedb nocreaterole noreplication`);
  }

  await pool.query(`grant connect on database ${databaseIdentifier} to ${identifier}`);
  await pool.query(`grant usage on schema public to ${identifier}`);
  await pool.query(`grant select, insert, update, delete on all tables in schema public to ${identifier}`);
  await pool.query(`grant usage, select on all sequences in schema public to ${identifier}`);
  await pool.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${identifier}`);
  await pool.query(`alter default privileges in schema public grant usage, select on sequences to ${identifier}`);
  console.log(`Usuário restrito do banco configurado: ${role}`);
} finally {
  await pool.end();
}
