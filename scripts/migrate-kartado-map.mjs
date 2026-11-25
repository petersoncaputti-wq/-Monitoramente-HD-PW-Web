import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/kartado-map-schema.sql', import.meta.url), 'utf8'));
  const role = process.env.DB_APP_USER?.trim() || process.env.DB_USER?.trim();
  if (role)
    await pool.query(
      `grant select, insert, update, delete on public.kartado_map_sync, public.kartado_map_points to "${role.replaceAll('"', '""')}"`,
    );
  console.log('Base do mapa de apontamentos criada/verificada.');
} finally {
  await pool.end();
}
