import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/kartado-tickets-schema.sql', import.meta.url), 'utf8'));
  const role = process.env.DB_APP_USER?.trim() || process.env.DB_USER?.trim();
  if (role) await pool.query(`GRANT SELECT, INSERT, UPDATE ON public.kartado_tickets TO "${role.replaceAll('"', '""')}"`);
  console.log('Base de chamados Kartado preparada.');
} finally { await pool.end(); }
