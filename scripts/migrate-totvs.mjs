import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';
const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/totvs-schema.sql', import.meta.url), 'utf8'));
  const result = await pool.query(`select indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'totvs_imports'
      and indexname = 'totvs_imports_report_period_uidx'`);
  if (!result.rows[0]?.indexdef.includes('UNIQUE')) throw new Error('Não foi possível confirmar a unicidade mensal.');
  const appRole = process.env.DB_APP_USER?.trim() || process.env.DB_USER?.trim();
  if (appRole) {
    const identifier = `"${appRole.replaceAll('"', '""')}"`;
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.totvs_imports TO ${identifier}`);
    await pool.query(`GRANT USAGE ON SEQUENCE public.totvs_imports_id_seq TO ${identifier}`);
    console.log('Permissões da tabela TOTVS atualizadas para o usuário da aplicação.');
  } else {
    console.log('Configure DB_APP_USER para conceder as permissões de importação e limpeza da tabela TOTVS.');
  }
  console.log('Tabela public.totvs_imports criada/verificada com um único registro por mês.');
} finally { await pool.end(); }
