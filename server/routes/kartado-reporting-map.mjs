import { clientIpKeyGenerator } from '../rate-limit-ip.mjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from '../auth.mjs';
import { ReportingDetailError } from '../services/kartado-reporting-detail.service.mjs';
import {
  createMapRepository,
  mapBounds,
  mapFilters,
  mapWorker,
  MAX_POINTS,
  syncOut,
} from '../services/kartado-map-snapshots.mjs';

// O mapa lê a base local (kartado_map_points), recoletada diariamente às 04:00.
export function createReportingMapRouter({
  authenticate = requireUser,
  repository = createMapRepository(),
  worker = mapWorker,
} = {}) {
  const router = Router();
  router.use(authenticate);
  router.use(
    rateLimit({
      keyGenerator: clientIpKeyGenerator,
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  const handle = (action) => async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json({ success: true, ...(await action(req)) });
    } catch (error) {
      const known = error instanceof ReportingDetailError;
      if (!known) console.error('[Mapa] Falha na consulta da base do mapa:', error?.message || error);
      res.status(known ? error.status : 503).json({
        success: false,
        error: known ? error.message : 'A base do mapa está indisponível no momento. Tente novamente em instantes.',
      });
    }
  };
  router.get(
    '/resumo',
    handle(async (req) => {
      const filters = mapFilters(req.query);
      await repository.ensure(filters.company);
      const [sync, summary] = await Promise.all([repository.sync(filters.company), repository.summary(filters)]);
      // Unidade ainda sem base: passa à frente da fila e a coleta começa na próxima etapa.
      if (!sync?.last_success_at) {
        await repository.prioritize(filters.company);
        void worker.tick();
      }
      return { company: filters.company, coleta: syncOut(sync), ...summary };
    }),
  );
  router.get(
    '/pontos',
    handle(async (req) => {
      const filters = mapFilters(req.query);
      const limit = Math.min(MAX_POINTS, Math.max(1, Number(req.query.limit) || MAX_POINTS));
      const center =
        req.query.lat !== undefined || req.query.lon !== undefined
          ? { lat: Number(req.query.lat), lon: Number(req.query.lon) }
          : null;
      if (center && !(Number.isFinite(center.lat) && Number.isFinite(center.lon)))
        throw new ReportingDetailError('Centro inválido.', 400);
      return repository.points(filters, mapBounds(req.query.bbox), {
        limit,
        pendingOnly: req.query.pendentes === '1',
        center,
      });
    }),
  );
  router.get(
    '/lista',
    handle(async (req) => {
      const filters = mapFilters(req.query);
      const page = Number(req.query.page || '1');
      if (!Number.isSafeInteger(page) || page < 1) throw new ReportingDetailError('Página inválida.', 400);
      return repository.list(filters, page);
    }),
  );
  router.post(
    '/atualizar',
    handle(async (req) => {
      const { company } = mapFilters({ company: req.query.company });
      await repository.ensure(company);
      const accepted = await repository.requestRefresh(company);
      if (accepted) void worker.tick();
      return { aceito: accepted, coleta: syncOut(await repository.sync(company)) };
    }),
  );
  return router;
}
export default createReportingMapRouter();
