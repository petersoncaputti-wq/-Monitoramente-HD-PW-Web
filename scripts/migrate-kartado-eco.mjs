import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  const schema = await readFile(new URL('../azure/kartado-eco-schema.sql', import.meta.url), 'utf8');
  await pool.query(schema.replace(/^\uFEFF/, ''));
  const role = process.env.DB_APP_USER?.trim() || process.env.DB_USER?.trim();
  if (role) {
    const identifier = `"${role.replaceAll('"', '""')}"`;
    await pool.query(`GRANT SELECT, INSERT ON public.kartado_eco_imports TO ${identifier}`);
    await pool.query(`GRANT USAGE ON SEQUENCE public.kartado_eco_imports_id_seq TO ${identifier}`);
  }
  console.log('Armazenamento de importações Eco preparado.');
} finally { await pool.end(); }
