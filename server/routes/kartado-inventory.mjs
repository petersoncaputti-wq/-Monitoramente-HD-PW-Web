import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser } from '../auth.mjs';
import { InventoryError } from '../services/kartado-inventory.service.mjs';
import { persistentInventory } from '../services/kartado-inventory-snapshots.mjs';

export function createInventoryRouter({ authenticate = requireUser, client = persistentInventory } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: 60_000, limit: 90, keyGenerator: req => String(req.user.id), standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, code: 'RATE_LIMIT', error: 'Muitas consultas. Aguarde um minuto e tente novamente.' } }));
  for (const [path, kind] of [['/resumo', 'resumo'], ['/cruzamento', 'cruzamento'], ['/itens', 'itens'], ['/:uuid/apontamentos', 'apontamentos']]) {
    router.get(path, async (req, res) => {
      const started = performance.now();
      const result = await client.request(kind, req.query, req.params.uuid);
      res.set('Server-Timing', `inventory;dur=${(performance.now() - started).toFixed(1)};desc="Consulta ao Agente Auditor"`);
      if (result.status === 202 || (result.status === 200 && Object.values(result.data.coleta || {}).some(source => source?.atualizacao.estado === 'em_andamento'))) res.set('Retry-After', String(result.retryAfter));
      res.status(result.status).json(result.data);
    });
  }
  router.use((error, _req, res, _next) => {
    const known = error instanceof InventoryError;
    res.status(known ? error.status : 502).json({ success: false, code: known ? error.code : 'INTEGRATION_ERROR', error: known ? error.message : 'O inventário está temporariamente indisponível.', ...(known && error.details && { detalhes: error.details }) });
  });
  return router;
}
export default createInventoryRouter();
