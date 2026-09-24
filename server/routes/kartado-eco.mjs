import express, { Router } from 'express';
import { requireUser, requireAdmin } from '../auth.mjs';
import { query } from '../db.mjs';
import { parseEcoWorkbook } from '../services/kartado-eco-import.service.mjs';
export function createEcoRouter({ execute = query, authenticate = requireUser, admin = requireAdmin } = {}) {
  const router = Router();
  router.use(authenticate);
  router.get('/', async (_req, res) => {
    const result = await execute('select id, file_name, imported_at, payload from kartado_eco_imports order by id desc limit 1');
    res.json(result.rows[0] ?? null);
  });
  router.post('/', admin, express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '5mb' }), async (req, res) => {
    let payload;
    const fileName = String(req.query.fileName || '').slice(0,255);
    try {
      if (!fileName.toLowerCase().endsWith('.xlsx')) throw new Error('Selecione um arquivo .xlsx.');
      payload = parseEcoWorkbook(req.body);
    } catch (error) { return res.status(400).json({ error: error.message }); }
    if (req.query.preview === 'true') return res.json({ payload, file_name: fileName });
    const result = await execute('insert into kartado_eco_imports (file_name, imported_by, payload) values ($1,$2,$3) returning id, file_name, imported_at, payload', [fileName, req.user.id, JSON.stringify(payload)]);
    res.json(result.rows[0]);
  });
  router.use((error, _req, res, next) => {
    if (error.code === '42P01') return res.status(503).json({ error: 'O banco ainda precisa da migração de importação Eco.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'O limite do Excel é 5 MB.' });
    next(error);
  });
  return router;
}
export default createEcoRouter();
