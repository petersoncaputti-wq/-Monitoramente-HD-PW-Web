import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireUser } from '../auth.mjs';
import { AuditError, auditConfiguration, createAuditorClient, validateAuditParams, validateCompany } from '../services/kartado-audit.service.mjs';
import { auditJobRepository, auditWorker } from '../services/kartado-audit-jobs.mjs';

export function createAuditRouter({ authenticate = requireUser, client = createAuditorClient(), repository = auditJobRepository, worker = auditWorker, configuration = auditConfiguration } = {}) {
  const router = Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/config', (_req, res) => res.json(configuration()));
  router.use((_req, _res, next) => {
    const config = configuration();
    if (config.provider !== 'auditor' || !config.configured) return next(new AuditError('A integração de apontamentos está desativada ou não configurada.', 503));
    next();
  });
  const remoteLimit = rateLimit({ windowMs: 60_000, limit: 20, keyGenerator: req => req.user.id,
    standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas consultas. Aguarde um minuto.' } });
  router.get('/concessoes', remoteLimit, async (_req, res) => res.json(await client.companies()));
  router.get('/origens', remoteLimit, async (req, res) => res.json(await client.origins(validateCompany(req.query.concessao))));
  router.post('/jobs', remoteLimit, async (req, res) => {
    const params = validateAuditParams(req.body);
    const id = await repository.enqueue(req.user.id, params);
    worker.start();
    res.status(202).json({ id });
  });
  router.get('/jobs/active', async (req, res) => res.json({ job: await repository.active(req.user.id) }));
  router.get('/jobs/:id', async (req, res) => {
    const row = await repository.get(validateCompany(req.params.id), req.user.id);
    if (!row) throw new AuditError('Consulta não encontrada ou expirada. Inicie uma nova busca.', 404);
    res.json(row);
  });
  router.get('/jobs/:id/result', async (req, res) => {
    const row = await repository.get(validateCompany(req.params.id), req.user.id, true);
    if (!row) throw new AuditError('Consulta não encontrada ou expirada. Inicie uma nova busca.', 404);
    if (row.status !== 'completed') throw new AuditError('O resultado ainda não está disponível.', 409);
    res.json({ ...row.result, retrievedAt: row.finished_at });
  });
  router.use((error, _req, res, _next) => {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    const message = error instanceof AuditError ? error.message : 'Não foi possível acessar as consultas. Verifique a configuração e a migração do banco.';
    res.status(error instanceof AuditError ? error.status : 503).json({ error: message });
  });
  return router;
}
export default createAuditRouter();
