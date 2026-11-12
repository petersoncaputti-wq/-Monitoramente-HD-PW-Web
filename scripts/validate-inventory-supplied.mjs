// Auditoria dos arquivos fornecidos, sem alterar os fontes nem acessar a rede.
// Uso: node scripts/validate-inventory-supplied.mjs <pasta-dos-tres-arquivos>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('Informe a pasta dos arquivos fornecidos.');
const load = name => readFileSync(resolve(directory, name), 'utf8');
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const clock = { now: Date.now() };
globalThis.__inventoryAuditClock = clock;
const inventoryItems = [
  { uuid: 'a', numero: '1', classeId: 'bridge', rodovia: 'SP-029', fotos: 1 },
  { uuid: 'b', numero: '2', classeId: 'bridge', rodovia: 'SP-029', fotos: 0 },
];
globalThis.__inventoryAuditDeps = {
  getToken: async () => ({ token: 'fake' }),
  listInventorySlim: async () => ({ items: inventoryItems, totalCount: 2, failedPages: 0, duplicatesRemoved: 0 }),
  listReportingsSlim: async () => ({ items: [
    { inventarioId: 'a', statusId: 'executed' },
    { inventarioId: null, statusId: 'planned' },
    { inventarioId: 'missing', statusId: 'planned' },
  ], totalCount: 3, failedPages: 0, duplicatesRemoved: 0 }),
  listOccurrenceTypeNames: async () => new Map([['bridge', 'Ponte']]),
  listStatusNames: async () => new Map([['executed', 'Executado'], ['planned', 'Programado']]),
  listInventorySpreadsheetPage: async () => ({ items: [], totalCount: 0 }),
  listReportingsByInventory: async () => ({ items: [], totalCount: 0 }),
};
let source = load('inventario-consolidation.service.js');
assert.match(source, /from '\.\/kartado\.service\.js'/);
source = source.replace(/import\s*\{([\s\S]*?)\}\s*from '\.\/kartado\.service\.js';/, 'const {$1} = globalThis.__inventoryAuditDeps;');
source = 'const __auditClock = globalThis.__inventoryAuditClock;\n' + source.replaceAll('Date.now()', '__auditClock.now');
source += '\nexport { createAsyncCache, avisos, pct, foundAtAfterFor };';
const service = await moduleFrom(source);
const observations = [];
const cache = service.createAsyncCache({ ttlMs: 100 });
const complete = { fetchFailedPages: 0, items: [1, 2] };
await cache.get('key', async () => complete, { waitMs: 1 });
const partial = { fetchFailedPages: 1, items: [1] };
await cache.get('key', async () => partial, { forceRefresh: true, waitMs: 1 });
const replaced = await cache.get('key', async () => complete);
assert.equal(replaced.data, partial);
assert.equal(replaced.stale, false);
observations.push('CONFIRMADO: coleta parcial substitui resultado completo e recebe TTL novo.');

clock.now += 101;
let attempts = 0;
const fail = async () => { attempts++; throw new Error('falha simulada'); };
await cache.get('key', fail);
await new Promise(r => setImmediate(r));
const stale = await cache.get('key', fail);
assert.equal(attempts, 1);
assert.ok(service.avisos(stale).some(text => text.includes('atualização roda')));
assert.equal('refreshError' in stale, false);
observations.push('CONFIRMADO: após falha, aviso afirma atualização em andamento durante cooldown, sem expor a falha.');

const refreshCache = service.createAsyncCache({ ttlMs: 100 });
let starts = 0;
const fast = async () => ({ generation: ++starts });
await refreshCache.get('x', fast, { forceRefresh: true, waitMs: 1 });
await refreshCache.get('x', fast, { forceRefresh: true, waitMs: 1 });
assert.equal(starts, 2);
const pendingCache = service.createAsyncCache({ ttlMs: 100 });
const pending = deferred(); let pendingStarts = 0;
const compute = () => { pendingStarts++; return pending.promise; };
assert.equal((await pendingCache.get('x', compute, { forceRefresh: true, waitMs: 1 })).state, 'processando');
assert.equal((await pendingCache.get('x', compute, { forceRefresh: true, waitMs: 1 })).state, 'processando');
assert.equal(pendingStarts, 1);
pending.resolve({ done: true });
await new Promise(r => setImmediate(r));
observations.push('CONFIRMADO: refresh reutiliza tarefa em andamento, mas inicia outra se a fonte já terminou; risco no polling de duas fontes.');

const crossing = (await service.getCruzamento('test', 'test', 'company', { dimensao: 'ativo', filtro: 'sem', status: 'Programado' })).result;
assert.deepEqual(crossing.linhas.map(row => row.uuid), ['a', 'b']);
assert.equal(crossing.totais.apontamentosVinculadosAAtivo, 1);
assert.equal(crossing.totais.apontamentosSemVinculo, 1);
assert.equal(crossing.totais.apontamentosAtivoForaDoInventario, 1);
assert.equal(crossing.totais.apontamentosNoRecorte, 0);
assert.equal(service.pct(0, 0), 0);
assert.equal('fetchDuplicatesRemoved' in crossing.fonte.inventario, false);
observations.push('CONFIRMADO: filtro=sem com status significa sem esse status; inclui ativo com outro apontamento.');
observations.push('CONFIRMADO: vinculados, sem vínculo e fora do inventário são grupos separados; totais globais não respeitam status.');
observations.push('CONFIRMADO: denominador zero produz 0%; metadados publicados omitem duplicatas removidas.');

// Testa o coletor real com transporte simulado; não chama a API.
let raw = load('kartado.service.js');
raw = raw.replaceAll('fetch(url,', 'globalThis.__inventoryAuditFetch(url,');
raw += '\nexport { fetchPages, sem };';
const collector = await moduleFrom(raw);
const response = payload => new Response(JSON.stringify(payload), { status: 200 });
globalThis.__inventoryAuditFetch = async url => {
  const query = new URL(url).searchParams;
  return response({ data: [{ id: 'same', attributes: {} }], meta: { pagination: { count: 2, pages: 2 } } });
};
const deduped = await collector.fetchPages('fake', '/Inventory/', { page_size: 1 });
assert.equal(deduped.items.length, 1);
assert.equal(deduped.totalCount, 2);
assert.equal(deduped.failedPages, 0);
assert.equal(deduped.duplicatesRemoved, 1);
observations.push('CONFIRMADO: deduplicação pode deixar menos registros que o total sem marcar página com falha.');

globalThis.__inventoryAuditFetch = async () => response({ unexpected: true });
const malformed = await collector.listInventorySlim('fake', 'company');
assert.equal(malformed.items.length, 0);
assert.equal(malformed.totalCount, 0);
assert.equal(malformed.failedPages, 0);
observations.push('CONFIRMADO: formato desconhecido sem errors vira inventário vazio com zero falhas.');

globalThis.__inventoryAuditFetch = async url => {
  const query = new URL(url).searchParams;
  if (query.get('page') === '2') return new Response('{}', { status: 500 });
  return response({ data: [{ id: 'class', attributes: { name: 'Ponte' } }], meta: { pagination: { count: 501, pages: 2 } } });
};
const catalog = await collector.listOccurrenceTypeNames('fake', 'company');
assert.equal(catalog.size, 1);
assert.equal('failedPages' in catalog, false);
observations.push('CONFIRMADO: falha parcial no catálogo não é propagada pelo Map de nomes.');

let active = 0; let maxActive = 0; let issued = 0;
const releaseRequests = deferred(); const allFiveStarted = deferred();
globalThis.__inventoryAuditFetch = async url => {
  const page = Number(new URL(url).searchParams.get('page'));
  if (page === 1) return response({ data: [{ id: 'first' }], meta: { pagination: { count: 4, pages: 4 } } });
  active++; issued++; maxActive = Math.max(maxActive, active);
  if (issued === 5) allFiveStarted.resolve();
  await releaseRequests.promise;
  active--;
  return response({ data: [{ id: `${new URL(url).pathname}-${page}` }], meta: { pagination: { count: 4, pages: 4 } } });
};
const scans = Promise.all([
  collector.fetchPages('fake', '/Inventory/', { page_size: 1 }, 0, { poolSize: 3 }),
  collector.fetchPages('fake', '/Reporting/', { page_size: 1 }, 0, { poolSize: 3 }),
]);
await Promise.race([allFiveStarted.promise, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Concorrência não observada')), 1000); t.unref(); })]);
releaseRequests.resolve(); await scans;
assert.equal(maxActive, 5);
observations.push('CONFIRMADO: duas varreduras com pool=3 ocupam as 5 conexões globais; não há reserva global de 2 slots.');
observations.forEach(value => console.log(value));
console.log(`Auditoria concluída: ${observations.length} observações verificadas; transporte simulado, sem chamadas remotas.`);
