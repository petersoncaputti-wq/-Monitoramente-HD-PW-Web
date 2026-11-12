import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { AuditError, auditConfiguration, createAuditorClient, validateAuditParams, validateAuditResult } from '../server/services/kartado-audit.service.mjs';
import { createAuditJobRepository, createAuditWorker } from '../server/services/kartado-audit-jobs.mjs';
import { createAuditRouter } from '../server/routes/kartado-audit.mjs';

const company = '17fd72c9-5d83-4345-a61a-f30875d61218';
const jobId = '00000000-0000-4000-8000-000000000001';
const params = { concessao: company, origem: 'TRO', periodo: 'recente', refresh: false };
const item = { uuid: 'one', origem: 'TRO', status: 'Identificado', dataCriacao: '2026-09-01', dataExecucao: null, dataVencimento: '2026-09-28', natureza: 'Drenagem', rodovia: 'BR-101', trecho: 'Norte', numero: 'ECC-01' };
const payload = { success: true, companyUuid: company, origem: 'TRO', periodo: 'recente', janelaDesde: '2025-09-29', totalConcessaoNaJanela: 100, totalFiltrado: 1, items: [item], fetchFailedPages: 1, trechoDisponivel: true, naturezasExcluidas: ['Pavimento Rígido'], origensDisponiveis: [{ origem: 'TRO', total: 1 }], fromCache: true, cachedAgeSec: 20 };
assert.equal(auditConfiguration({}).configured, false);
assert.equal(auditConfiguration({}).provider, 'legacy');
assert.equal(auditConfiguration({ KARTADO_REPORTINGS_PROVIDER: 'auditor' }).provider, 'auditor');
assert.equal(auditConfiguration({ KARTADO_REPORTINGS_PROVIDER: 'legacy' }).provider, 'legacy');
assert.deepEqual(validateAuditParams({ concessao: company, origem: ' TRO ' }), params);
for (const body of [null, {}, { ...params, origem: '' }, { ...params, concessao: '../status' }, { ...params, periodo: 'other' }, { ...params, refresh: '1' }]) assert.throws(() => validateAuditParams(body), AuditError);
assert.equal(validateAuditResult(payload, params).fetchFailedPages, 1);
for (const invalid of [{ ...payload, totalFiltrado: 2 }, { ...payload, fetchFailedPages: undefined }, { ...payload, companyUuid: jobId }, { ...payload, items: [{ ...item, origem: 'Outra' }] }, { ...payload, items: [item, item], totalFiltrado: 2 }]) assert.throws(() => validateAuditResult(invalid, params), AuditError);

let captured;
const env = { AGENTE_AUDITOR_BASE_URL: 'https://example.test', MONITORAMENTO_API_KEY: 'server-only-test-key' };
const client = createAuditorClient({ env, fetchImpl: async (url, options) => { captured = { url, options }; return new Response(JSON.stringify(payload), { status: 200 }); } });
await client.reportings(params);
assert.equal(captured.options.headers['x-api-key'], env.MONITORAMENTO_API_KEY);
assert.equal(captured.options.redirect, 'error');
assert.equal(captured.url.searchParams.get('refresh'), '0');
assert.equal(captured.url.pathname, '/api/v1/monitoramento/apontamentos');
await assert.rejects(createAuditorClient({ env: {} }).companies(), error => error.status === 503);
await assert.rejects(createAuditorClient({ env, fetchImpl: async () => new Response('secret must not propagate', { status: 429, headers: { 'Retry-After': '30' } }) }).companies(), error => error.status === 429 && error.retryAfter === 30 && !error.message.includes('secret'));
await assert.rejects(createAuditorClient({ env, fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }).companies(), error => error.status === 504);
await assert.rejects(createAuditorClient({ env, fetchImpl: async () => new Response('private diagnostic', { status: 401 }) }).companies(), error => error.status === 502 && !error.message.includes('private'));

// Regras de negócio do frontend: executa o módulo TypeScript real, sem cópia da implementação.
const source = readFileSync(new URL('../src/utils/kartadoAudit.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { auditCounts, auditOverdue, filterAuditItems, emptyAuditFilters, safeKartadoLink } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const sample = [item, { ...item, uuid: 'two', status: 'Executado', dataExecucao: '2026-09-25' }, { ...item, uuid: 'three', status: 'Cancelado' }, { ...item, uuid: 'four', dataVencimento: '2026-09-29', trecho: 'Sul' }, { ...item, uuid: 'five', dataVencimento: null, dataCriacao: null }];
assert.deepEqual(auditCounts(sample, '2026-09-29'), { total: 5, pending: 3, completed: 1, other: 1, overdue: 1 });
assert.equal(auditOverdue(sample[3], '2026-09-29'), false);
assert.equal(auditOverdue({ ...item, dataExecucao: '2026-09-27' }, '2026-09-29'), false);
assert.equal(filterAuditItems(sample, { ...emptyAuditFilters, from: '2026-09-01', to: '2026-09-28' }).length, 4);
assert.equal(filterAuditItems(sample, { ...emptyAuditFilters, section: 'Sul' }).length, 1);
assert.equal(filterAuditItems(sample, { ...emptyAuditFilters, status: 'Executado', search: 'drenagem' }).length, 1);
assert.equal(safeKartadoLink('javascript:alert(1)'), null);
assert.equal(safeKartadoLink('https://app.kartado.com.br.evil.test/'), null);
assert.ok(safeKartadoLink('https://app.kartado.com.br/#/SharedLink/Reporting/one'));

// O worker mantém a resposta parcial e não expõe erros internos.
let queued = { id: jobId, params }, completed, failed, release;
const workRepo = { claim: async () => { const next = queued; queued = null; return next; }, complete: async (_id, data) => { completed = data; }, fail: async (_id, error) => { failed = error; } };
const worker = createAuditWorker({ repository: workRepo, enabled: () => true, client: { reportings: () => new Promise(resolve => { release = resolve; }) } });
const inFlight = worker.tick();
await new Promise(resolve => setTimeout(resolve, 0));
await worker.tick(); // Não inicia uma segunda busca no mesmo worker.
release(payload); await inFlight;
assert.equal(completed.fetchFailedPages, 1);
assert.equal(completed.fromCache, true);
queued = { id: jobId, params };
await createAuditWorker({ repository: workRepo, enabled: () => true, client: { reportings: async () => { throw new Error('secret-private'); } } }).tick();
assert.ok(failed && !failed.includes('secret'));

// Contrato HTTP e isolamento: usuários diferentes não podem ler o job de outra sessão.
const jobs = new Map();
const repo = {
  active: async user => [...jobs.values()].find(row => row.user === user && ['queued', 'running'].includes(row.status)) || null,
  enqueue: async (user, body) => { jobs.set(jobId, { id: jobId, user, params: body, status: 'queued' }); return jobId; },
  get: async (id, user, includeResult) => { const row = jobs.get(id); if (!row || row.user !== user) return null; return includeResult ? { ...row, result: payload, finished_at: '2026-09-29T12:00:00Z' } : row; },
};
const app = express(); app.use(express.json());
app.use('/audit', createAuditRouter({
  authenticate: (req, res, next) => { if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: req.headers.authorization }; next(); },
  configuration: () => ({ provider: 'auditor', configured: true }), repository: repo, worker: { start() {} },
  client: { companies: async () => ({ success: true, concessoes: [{ uuid: company, nome: 'Capixaba' }] }), origins: async () => ({ success: true, origensAmostra: [] }) },
}));
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/audit`;
const headers = { Authorization: 'alice', 'Content-Type': 'application/json' };
try {
  assert.equal((await fetch(url + '/config')).status, 401);
  assert.equal((await fetch(url + '/jobs', { method: 'POST', headers, body: '{}' })).status, 400);
  assert.equal((await fetch(url + '/jobs', { method: 'POST', headers, body: JSON.stringify(params) })).status, 202);
  assert.equal((await (await fetch(url + '/jobs/active', { headers })).json()).job.id, jobId);
  assert.equal((await (await fetch(url + '/jobs/active', { headers: { Authorization: 'bob' } })).json()).job, null);
  const status = await fetch(url + '/jobs/' + jobId, { headers });
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  assert.equal((await status.json()).status, 'queued');
  assert.equal((await fetch(url + '/jobs/' + jobId, { headers: { Authorization: 'bob' } })).status, 404);
  assert.equal((await fetch(url + '/jobs/' + jobId + '/result', { headers: { Authorization: 'bob' } })).status, 404);
  assert.equal((await fetch(url + '/jobs/' + jobId + '/result', { headers })).status, 409);
  jobs.get(jobId).status = 'completed';
  const result = await (await fetch(url + '/jobs/' + jobId + '/result', { headers })).json();
  assert.equal(result.fetchFailedPages, 1); assert.equal(result.items.length, 1);
  assert.equal(JSON.stringify(result).includes(env.MONITORAMENTO_API_KEY), false);
  assert.equal((await fetch(url + '/origens?concessao=invalid', { headers })).status, 400);
} finally { server.closeAllConnections(); server.close(); }
// Executa a migração e as consultas reais num PostgreSQL embutido e descartável.
// Não substitui o teste de múltiplas réplicas no Azure.
const db = new PGlite();
try {
  await db.exec('create table app_users (id uuid primary key)');
  const schema = readFileSync(new URL('../azure/kartado-audit-schema.sql', import.meta.url), 'utf8');
  await db.exec(schema); await db.exec(schema); // Migração idempotente.
  const users = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000013'];
  for (const user of users) await db.query('insert into app_users(id) values ($1)', [user]);
  const persistent = createAuditJobRepository({ execute: (sql, values) => db.query(sql, values), transaction: callback => db.transaction(callback) });
  const first = await persistent.enqueue(users[0], params);
  assert.equal((await persistent.active(users[0])).id, first);
  assert.equal(await persistent.active(users[1]), null);
  assert.equal(await persistent.enqueue(users[0], { ...params }), first);
  await assert.rejects(persistent.enqueue(users[0], { ...params, origem: 'NS' }), error => error.status === 409);
  const second = await persistent.enqueue(users[1], params);
  const third = await persistent.enqueue(users[2], params);
  assert.equal((await persistent.claim()).id, first);
  assert.equal((await persistent.claim()).id, second);
  assert.equal(await persistent.claim(), null); // Limite global de duas buscas.
  assert.equal(await persistent.get(first, users[1]), null);
  await persistent.complete(first, payload);
  assert.equal((await persistent.get(first, users[0], true)).result.fetchFailedPages, 1);
  assert.equal((await persistent.claim()).id, third);
  await persistent.fail(third, 'Limite de consultas', 30);
  assert.ok((await persistent.get(third, users[2])).retry_at);
  await assert.rejects(persistent.enqueue(users[2], params), error => error.status === 429 && error.retryAfter > 0);
  await db.query("update kartado_audit_jobs set started_at=now()-interval '17 minutes' where id=$1", [second]);
  await persistent.claim();
  assert.equal((await persistent.get(second, users[1])).status, 'failed');
  await persistent.complete(second, payload); // Um worker atrasado não sobrescreve o timeout.
  assert.equal((await persistent.get(second, users[1])).status, 'failed');
  await db.query("update kartado_audit_jobs set expires_at=now()-interval '1 second' where id=$1", [first]);
  assert.equal(await persistent.get(first, users[0]), null);
  await persistent.claim();
  assert.equal((await db.query('select count(*)::int as count from kartado_audit_jobs where id=$1', [first])).rows[0].count, 0);
} finally { await db.close(); }
console.log('Apontamentos: autenticação, isolamento, contratos, filtro de origem, falhas parciais/cache, fila PostgreSQL, migração idempotente, timeout, rate limit e indicadores: OK.');
