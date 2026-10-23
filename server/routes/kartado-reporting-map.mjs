import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from '../auth.mjs';
import { ReportingDetailError } from '../services/kartado-reporting-detail.service.mjs';
import { createReportingMapClient } from '../services/kartado-reporting-map.service.mjs';
export function createReportingMapRouter({ authenticate = requireUser, client = createReportingMapClient() } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.get('/', async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await client.page(req.query)); }
    catch (error) {
      const known = error instanceof ReportingDetailError;
      const upstream = [401, 403].includes(error.httpStatus) ? 403 : error.httpStatus === 429 ? 429 : 502;
      res.status(known ? error.status : upstream).json({ success: false, error: known ? error.message : upstream === 403 ? 'A integração não tem acesso aos apontamentos desta unidade.' : 'Não foi possível consultar os pontos do mapa. Tente novamente.' });
    }
  });
  return router;
}
export default createReportingMapRouter();
