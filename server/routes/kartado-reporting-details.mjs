import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from '../auth.mjs';
import { createReportingDetailClient, ReportingDetailError } from '../services/kartado-reporting-detail.service.mjs';

export function createReportingDetailRouter({ authenticate = requireUser, client = createReportingDetailClient() } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.get('/:uuid', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await client.get(req.query.company, req.params.uuid)); } catch (error) { next(error); }
  });
  router.get('/:uuid/arquivos', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await client.files(req.query.company, req.params.uuid, Number(req.query.page || 1))); } catch (error) { next(error); }
  });
  router.use((error, _req, res, _next) => {
    const known = error instanceof ReportingDetailError;
    res.status(known ? error.status : 502).json({ success: false, error: known ? error.message : 'Não foi possível consultar os dados do apontamento.' });
  });
  return router;
}
export default createReportingDetailRouter();
