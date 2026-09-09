import express, { Router } from 'express';
import { requireUser, requireAdmin } from '../auth.mjs';
import { query } from '../db.mjs';
import { parseTotvsZip, selectTotvsPayload } from '../services/totvs-import.service.mjs';

const router = Router();
router.use(requireUser);
router.get('/', async (_request, response) => {
  const result = await query('select id, report_period, source_updated_at, imported_at from totvs_imports order by report_period desc, imported_at desc limit 200');
  response.json(result.rows);
});
router.get('/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Importação inválida.' });
  const result = await query('select id, payload from totvs_imports where id = $1', [request.params.id]);
  if (!result.rows[0]) return response.status(404).json({ error: 'Importação não encontrada.' });
  response.json(result.rows[0]);
});
router.post('/', requireAdmin, express.raw({ type: 'application/zip', limit: '10mb' }), async (request, response) => {
  let payload;
  try {
    if (!Buffer.isBuffer(request.body)) throw new Error('Envie um arquivo ZIP.');
    const parsed = parseTotvsZip(request.body, String(request.query.period || ''));
    payload = selectTotvsPayload(parsed);
  } catch (error) { return response.status(400).json({ error: error.message || 'ZIP inválido.' }); }
  const result = await query(
    `insert into totvs_imports (report_period, source_updated_at, imported_by, payload)
     values ($1,$2,$3,$4) on conflict (report_period)
     do update set payload = excluded.payload, source_updated_at = excluded.source_updated_at,
       imported_by = excluded.imported_by, imported_at = now()
     returning id, payload`,
    [payload.reportPeriod, payload.sourceUpdatedAt, request.user.id, JSON.stringify(payload)],
  );
  response.json(result.rows[0]);
});
router.use((error, _request, response, next) => {
  if (error.code === '42P01') return response.status(503).json({ error: 'O armazenamento do painel TOTVs ainda não foi preparado.' });
  next(error);
});
export default router;
