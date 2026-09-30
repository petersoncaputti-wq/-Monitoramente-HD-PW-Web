import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/saml-schema.sql', import.meta.url), 'utf8'));
  const role = process.env.DB_APP_USER?.trim() || process.env.DB_USER?.trim();
  if (role) {
    const identifier = `"${role.replaceAll('"', '""')}"`;
    await pool.query(`grant select on public.app_saml_identities to ${identifier}`);
    await pool.query(`grant select,insert,delete on public.app_saml_flows,public.app_saml_requests to ${identifier}`);
  }
  console.log('Estrutura SAML criada/verificada. Login permanece sujeito à configuração SAML_ENABLED.');
} finally { await pool.end(); }
