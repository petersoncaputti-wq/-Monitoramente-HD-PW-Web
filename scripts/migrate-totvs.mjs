import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/totvs-schema.sql', import.meta.url), 'utf8'));
  const result = await pool.query(`select indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'totvs_imports'
      and indexname = 'totvs_imports_report_period_uidx'`);
  if (!result.rows[0]?.indexdef.includes('UNIQUE')) throw new Error('Não foi possível confirmar a unicidade mensal.');
  console.log('Tabela public.totvs_imports criada/verificada com um único registro por mês.');
} finally { await pool.end(); }
