// Validação isolada dos arquivos corrigidos; todo transporte é simulado.
// node scripts/validate-inventory-corrected.mjs C:/Users/Peterson/Downloads
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateInventoryResponse } from '../server/services/kartado-inventory.service.mjs';
const directory = process.argv[2];
if (!directory) throw new Error('Informe a pasta dos três arquivos.');
const load = name => readFileSync(existsSync(resolve(directory, name)) ? resolve(directory, name) : resolve(directory, name.includes('router') ? 'routes' : 'services', name), 'utf8');
const catalogObjects = load('inventario-consolidation.service.js').includes('classes.names');
let moduleId = 0;
const moduleFrom = source => import('data:text/javascript;base64,' + Buffer.from(source + `\n// module ${++moduleId}`).toString('base64'));
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const clock = { now: Date.parse('2026-10-22T12:00:00Z') };
globalThis.__correctedClock = clock;
const quality = (complete = true) => ({ completa: complete, motivos: complete ? [] : ['Coleta parcial simulada.'] });
const data = (complete = true, version = 1) => ({ generatedAt: new Date(clock.now).toISOString(), integridade: quality(complete), version });
const catalog = (entries, complete = true) => catalogObjects
  ? { names: new Map(entries), completo: complete, esperados: entries.length, recebidos: entries.length }
  : Object.assign(new Map(entries), { integridade: { completo: complete, esperados: entries.length, recebidos: entries.length } });
const datasets = new Map();
const normal = () => ({
  inv: { items: [
    { uuid: 'a', numero: '1', classeId: 'bridge', rodovia: 'SP-029', fotos: 1 },
    { uuid: 'b', numero: '2', classeId: 'bridge', rodovia: 'SP-029', fotos: 0 },
    { uuid: 'c', numero: '3', classeId: 'bridge', rodovia: 'SP-029', fotos: 0 },
  ], totalCount: 3, failedPages: 0 },
  rep: { items: [
    { inventarioId: 'a', classeId: 'bridge', statusId: 'executed' },
    { inventarioId: 'b', classeId: 'bridge', statusId: 'executed' },
    { inventarioId: 'b', classeId: 'bridge', statusId: 'planned' },
    { inventarioId: null, statusId: 'planned' },
    { inventarioId: 'missing', statusId: 'planned' },
  ], totalCount: 5, failedPages: 0 },
  classes: catalog([['bridge', 'Ponte']]),
  statuses: catalog([['executed', 'Executado'], ['planned', 'Programado']]),
});
const dataset = id => { if (!datasets.has(id)) datasets.set(id, normal()); return datasets.get(id); };
globalThis.__correctedDeps = {
  getToken: async () => ({ token: 'fake' }),
  listInventorySlim: async (_, id) => dataset(id).inv,
  listReportingsSlim: async (_, id) => dataset(id).rep,
  listOccurrenceTypeNames: async (_, id) => dataset(id).classes,
  listStatusNames: async (_, id) => dataset(id).statuses,
  listInventorySpreadsheetPage: async () => ({ items: [], totalCount: 0 }),
  listReportingsByInventory: async () => ({ items: [{ id: 'r', relationships: { occurrenceType: { data: { id: 'missing' } }, status: { data: { id: 'missing' } } } }], totalCount: 1 }),
};
let source = load('inventario-consolidation.service.js')
  .replace(/import\s*\{([\s\S]*?)\}\s*from '\.\/kartado\.service\.js';/, 'const {$1} = globalThis.__correctedDeps;');
source = 'const __clock = globalThis.__correctedClock;\n' + source.replaceAll('Date.now()', '__clock.now');
source += '\nexport { createAsyncCache, pct };';
const loadedService = await moduleFrom(source);
// Normaliza apenas a observação do cache: as duas versões expõem o mesmo
// contrato HTTP, mas organizam seus metadados internos de formas diferentes.
const service = { ...loadedService, createAsyncCache: options => {
  const cache = loadedService.createAsyncCache(options);
  return { get: async (...args) => {
    const result = await cache.get(...args);
    if (result.state === 'pronto' && !result.coleta) return { ...result, stale: result.atualidade.expirado,
      coleta: { integridade: result.data.integridade, atualidade: result.atualidade, atualizacao: result.atualizacao } };
    return result;
  } };
} };
const results = [];
async function test(name, body) { await body(); results.push(name); console.log('PASS:', name); }

await test('Cache: parcial preserva completa, diagnóstico separado e recuperação', async () => {
  const cache = service.createAsyncCache({ ttlMs: 600_000 });
  const complete = data();
  await cache.get('a', async () => complete);
  clock.now += 300_001;
  const immediate = await cache.get('a', async () => data(false, 2), { forceRefresh: true });
  assert.equal(immediate.data, complete);
  assert.equal(immediate.coleta.atualizacao.estado, 'em_andamento');
  await tick();
  const preserved = await cache.get('a', async () => assert.fail('Não deve repetir no cooldown'), { forceRefresh: true });
  assert.equal(preserved.data, complete);
  assert.equal(preserved.coleta.atualizacao.estado, 'incompleta');
  assert.equal(preserved.coleta.integridade.completa, true);
  clock.now += 300_001;
  await cache.get('a', async () => data(true, 3), { forceRefresh: true });
  await tick();
  const recovered = await cache.get('a', async () => assert.fail());
  assert.equal(recovered.data.version, 3);
  assert.equal(recovered.coleta.atualizacao.estado, 'ociosa');
});
await test('Cache: primeira parcial tem validade 15min e pode ser substituída por completa', async () => {
  const cache = service.createAsyncCache({ ttlMs: 21_600_000 });
  const partial = await cache.get('a', async () => data(false));
  assert.equal(partial.coleta.atualidade.validadeSeg, 900);
  clock.now += 300_001;
  await cache.get('a', async () => data(true, 2), { forceRefresh: true });
  await tick();
  assert.equal((await cache.get('a', async () => assert.fail())).data.version, 2);
});
await test('Cache: falha preserva dados e expõe erro sem anunciar atualização em andamento', async () => {
  const cache = service.createAsyncCache({ ttlMs: 100 });
  const previous = data();
  await cache.get('a', async () => previous);
  clock.now += 300_001;
  await cache.get('a', async () => { throw new Error('falha simulada'); });
  await tick();
  const failed = await cache.get('a', async () => assert.fail());
  assert.equal(failed.data, previous);
  assert.equal(failed.stale, true);
  assert.equal(failed.coleta.atualizacao.estado, 'falhou');
  assert.match(failed.coleta.atualizacao.erro, /falha simulada/);
});
await test('Cache: primeira falha respeita cooldown e depois recupera', async () => {
  const cache = service.createAsyncCache({ ttlMs: 100 });
  let attempts = 0;
  const fail = async () => { attempts++; throw new Error('indisponível'); };
  await assert.rejects(cache.get('a', fail), /indisponível/);
  await assert.rejects(cache.get('a', fail, { forceRefresh: true }), /indisponível/);
  assert.equal(attempts, 1);
  clock.now += 300_001;
  assert.equal((await cache.get('a', async () => data())).state, 'pronto');
});
await test('Cache: polling não reinicia coleta, nem refresh imediato após conclusão', async () => {
  const cache = service.createAsyncCache({ ttlMs: 600_000 });
  const pending = deferred(); let starts = 0;
  const compute = () => { starts++; return pending.promise; };
  assert.equal((await cache.get('a', compute, { waitMs: 1, forceRefresh: true })).state, 'processando');
  assert.equal((await cache.get('a', compute, { waitMs: 1, forceRefresh: true })).state, 'processando');
  assert.equal(starts, 1);
  pending.resolve(data()); await tick();
  assert.equal((await cache.get('a', compute, { forceRefresh: true })).state, 'pronto');
  assert.equal(starts, 1);
});
await test('Cache: limite não descarta tarefa em andamento', async () => {
  const cache = service.createAsyncCache({ ttlMs: 100, maxEntries: 1 });
  const pending = deferred();
  await cache.get('a', () => pending.promise, { waitMs: 1 });
  await assert.rejects(cache.get('b', async () => data()), e => e.code === 'COLETAS_OCUPADAS');
  pending.resolve(data()); await tick();
});
await test('Cruzamento: status mantém presença e totais, com campos NoStatus e filtros de ativos', async () => {
  const all = (await service.getCruzamento('u', 'p', 'complete')).result;
  const filtered = (await service.getCruzamento('u', 'p', 'complete', { status: 'Programado' })).result;
  assert.equal(filtered.totais.ativosComApontamento, 2);
  assert.equal(filtered.totais.ativosSemApontamento, 1);
  assert.equal(filtered.totais.apontamentosNoRecorte, all.totais.apontamentosNoRecorte);
  assert.equal(filtered.totais.ativosComApontamentoNoStatus, 1);
  assert.equal(filtered.totais.apontamentosNoStatus, 1);
  assert.equal(filtered.linhas[0].ativosComApontamentoNoStatus, 1);
  const active = (await service.getCruzamento('u', 'p', 'complete', { dimensao: 'ativo', status: 'programado' })).result;
  assert.deepEqual(active.linhas.map(r => r.uuid), ['b']);
  assert.equal(active.linhas[0].apontamentos, 2);
  assert.equal(active.linhas[0].apontamentosNoStatus, 1);
  const absent = (await service.getCruzamento('u', 'p', 'complete', { dimensao: 'ativo', filtro: 'sem' })).result;
  assert.deepEqual(absent.linhas.map(r => r.uuid), ['c']);
  await assert.rejects(service.getCruzamento('u', 'p', 'complete', { filtro: 'sem', status: 'Programado' }), e => e.code === 'FILTRO_INCOMPATIVEL');
  await assert.rejects(service.getCruzamento('u', 'p', 'complete', { filtro: 'invalid' }), e => e.code === 'INVALID_PARAM');
});
await test('Parcial: totais mínimos, percentuais nulos, ausência bloqueada e vínculo não recebido', async () => {
  const d = dataset('partial'); d.inv.totalCount = 4; d.inv.duplicatesRemoved = 1;
  const summary = (await service.getInventarioResumo('u', 'p', 'partial')).result;
  assert.equal(summary.coletaCompleta, false);
  assert.equal(summary.totalRecebido, 3);
  assert.equal(summary.pctComFoto, null);
  assert.equal(summary.porClasse[0].pctComFoto, null);
  assert.equal(summary.coleta.inventario.integridade.faltando, 1);
  assert.equal(summary.coleta.inventario.integridade.duplicadosRemovidos, 1);
  const cross = (await service.getCruzamento('u', 'p', 'partial')).result;
  assert.equal(cross.totais.ativosSemApontamento, null);
  assert.equal(cross.linhas[0].pctAtivosComApontamento, null);
  assert.equal(cross.totais.apontamentosAtivoForaDoInventario, null);
  assert.equal(cross.totais.apontamentosAtivoNaoRecebido, 1);
  await assert.rejects(service.getCruzamento('u', 'p', 'partial', { dimensao: 'ativo', filtro: 'sem' }), e => e.httpStatus === 409 && e.detalhes.coleta.inventario.integridade.completa === false);
  const rp = dataset('partial-reporting'); rp.rep.failedPages = 1;
  const reportingPartial = (await service.getCruzamento('u', 'p', 'partial-reporting')).result;
  assert.equal(reportingPartial.coletaCompleta, false);
  assert.equal(reportingPartial.totais.ativosSemApontamento, null);
  assert.equal(reportingPartial.totais.apontamentosAtivoForaDoInventario, 1);
});
await test('Catálogos: falhas propagadas, não resolvido distinto de não informado, detalhe 503/404', async () => {
  const d = dataset('catalog'); d.classes = catalog([], false); d.statuses = catalog([], false);
  d.inv.items[1].classeId = null;
  const summary = (await service.getInventarioResumo('u', 'p', 'catalog')).result;
  assert.equal(summary.coletaCompleta, false);
  assert.ok(summary.porClasse.some(r => r.classe === 'Classe não resolvida (catálogo)'));
  assert.ok(summary.porClasse.some(r => r.classe === 'Classe não informada'));
  await assert.rejects(service.getInventarioItens('u', 'p', 'catalog', { classe: 'Ausente' }), e => e.httpStatus === 503);
  await assert.rejects(service.getInventarioItens('u', 'p', 'complete', { classe: 'Ausente' }), e => e.httpStatus === 404);
  const detail = await service.getApontamentosDoAtivo('u', 'p', 'catalog', 'a');
  assert.equal(detail.catalogosCompletos, false);
  assert.equal(detail.apontamentos[0].status, 'Status não resolvido (catálogo)');
});
await test('Inventário vazio completo: percentual não aplicável', async () => {
  const d = dataset('empty'); d.inv.items = []; d.inv.totalCount = 0;
  const summary = (await service.getInventarioResumo('u', 'p', 'empty')).result;
  assert.equal(summary.coletaCompleta, true);
  assert.equal(summary.pctComFoto, null);
  assert.equal(service.pct(0, 0), null);
});

// Coletor real, transporte substituído. Nenhuma chamada à rede.
let raw = load('kartado.service.js').replaceAll('fetch(url,', 'globalThis.__correctedFetch(url,');
raw += '\nexport { fetchPages, sem, scanSem };';
const collector = await moduleFrom(raw);
const response = payload => new Response(JSON.stringify(payload), { status: 200 });
const page = (items, count) => ({ data: items, meta: { pagination: { count } } });
await test('Coletor: rejeita formato inesperado e total ausente/inválido em coleta e detalhes', async () => {
  for (const payload of [{ unexpected: [] }, { data: [] }, [], { data: [], meta: { pagination: { count: '2' } } }]) {
    globalThis.__correctedFetch = async () => response(payload);
    await assert.rejects(collector.listInventorySlim('fake', 'company'), e => e.httpStatus === 502 && e.code === 'FORMATO_INESPERADO');
    await assert.rejects(collector.listInventorySpreadsheetPage('fake', 'company'), e => e.code === 'FORMATO_INESPERADO');
    await assert.rejects(collector.listReportingsByInventory('fake', 'company', 'a'), e => e.code === 'FORMATO_INESPERADO');
  }
  globalThis.__correctedFetch = async url => Number(new URL(url).searchParams.get('page')) === 1 ? response(page([{ id: 'a' }], 2)) : response({ data: [] });
  await assert.rejects(collector.fetchPages('fake', '/Inventory/', { page_size: 1 }), e => e.code === 'FORMATO_INESPERADO');
});
await test('Coletor: deduplicação e contagem incompleta, inclusive página única', async () => {
  globalThis.__correctedFetch = async () => response(page([{ id: 'same' }], 2));
  const result = await collector.fetchPages('fake', '/Inventory/', { page_size: 1 });
  assert.equal(result.items.length, 1); assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.failedPages, 0); assert.equal(result.complete, false);
  globalThis.__correctedFetch = async () => response(page([{ id: 'same' }, { id: 'same' }], 2));
  const single = await collector.fetchPages('fake', '/Inventory/', { page_size: 100 });
  assert.equal(single.items.length, 1); assert.equal(single.complete, false);
});
await test('Coletor: catálogo parcial mantém Map e diagnóstico', async () => {
  globalThis.__correctedFetch = async url => Number(new URL(url).searchParams.get('page')) === 1
    ? response(page([{ id: 'a', attributes: { name: 'Ponte' } }], 501))
    : new Response('{}', { status: 500 });
  const map = await collector.listOccurrenceTypeNames('fake', 'company');
  assert.equal((map.names || map).get('a'), 'Ponte'); assert.equal((map.integridade || map).completo, false);
  assert.equal((map.integridade || map).paginasFalhas, 1);
});
await test('Coletor: varreduras juntas usam no máximo 3 slots e liberam slots após falha', async () => {
  let active = 0, maxActive = 0;
  globalThis.__correctedFetch = async url => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 2)); active--;
    const params = new URL(url).searchParams;
    return response(page([{ id: params.get('page') }], 8));
  };
  await Promise.all([1, 2].map(i => collector.fetchPages('fake', `/Inventory/${i}/`, { page_size: 1 }, 0, { poolSize: 3 })));
  assert.equal(maxActive, 3);
  assert.equal(collector.sem.status().active, 0); assert.equal(collector.scanSem.status().active, 0);
  globalThis.__correctedFetch = async () => { throw new Error('falha'); };
  await assert.rejects(collector.listInventorySlim('fake', 'company'));
  assert.equal(collector.sem.status().active, 0); assert.equal(collector.scanSem.status().active, 0);
});

await test('Coletor: páginas acima de 6MB são divididas sem perder o recorte', async () => {
  const requested = [];
  globalThis.__correctedFetch = async url => {
    const params = new URL(url).searchParams;
    const ps = Number(params.get('page_size')), p = Number(params.get('page'));
    requested.push([p, ps]);
    if (ps === 100) return response({ errors: [{ detail: 'request_payload_cannot_exceed_six_megabytes' }] });
    return response(page(Array.from({ length: 50 }, (_, i) => ({ id: String((p - 1) * ps + i) })), 100));
  };
  const result = await collector.fetchPages('fake', '/Inventory/', { page_size: 100 });
  assert.equal(result.items.length, 100); assert.equal(result.complete, true);
  assert.deepEqual(requested, [[1, 100], [1, 50], [2, 50]]);
});
await test('Coletor: consultas diretas podem usar os dois slots restantes durante varreduras', async () => {
  const gate = deferred(); let scans = 0, direct = 0;
  const scanStarted = deferred();
  globalThis.__correctedFetch = async url => {
    if (new URL(url).pathname === '/Company/') direct++; else scans++;
    if (scans === 3 && direct === 2) gate.resolve();
    if (scans === 3) scanStarted.resolve();
    await gate.promise;
    return response(page([{ id: 'a' }], 1));
  };
  const scanning = Promise.all([1, 2, 3].map(i => collector.fetchPages('fake', `/Inventory/${i}/`, { page_size: 1 })));
  await scanStarted.promise;
  await Promise.all([scanning, collector.listCompanies('fake'), collector.listCompanies('fake')]);
  assert.equal(scans, 3); assert.equal(direct, 2);
  assert.equal(collector.sem.status().active, 0); assert.equal(collector.scanSem.status().active, 0);
});

await test('Contrato real da consolidação é aceito pelo adaptador do painel', async () => {
  const summary = (await service.getInventarioResumo('u', 'p', 'contract')).result;
  assert.equal(validateInventoryResponse({ success: true, status: 'pronto', ...summary }, 'resumo', { concessao: 'contract' }).coletaCompleta, true);
  const crossing = (await service.getCruzamento('u', 'p', 'contract', { status: 'Programado' })).result;
  const validated = validateInventoryResponse({ success: true, status: 'pronto', ...crossing }, 'cruzamento', { concessao: 'contract', dimensao: 'classe', periodo: 'recente', status: 'Programado' });
  assert.equal(validated.totais.ativosComApontamento, 2);
  assert.equal(validated.totais.ativosComApontamentoNoStatus, 1);
});

await test('Router: 202 Retry-After, 400 incompatível e 409 com detalhes', async () => {
  const routes = new Map();
  globalThis.__correctedRouter = { get: (path, handler) => routes.set(path, handler) };
  globalThis.__correctedRouteDeps = { ...service, getInventarioResumo: async () => ({ state: 'processando', etapa: 'inventario', iniciadoEm: 'date', decorridoSeg: 20 }) };
  let router = load('monitoramento.router.js')
    .replace("import { Router } from 'express';", 'const Router = () => globalThis.__correctedRouter;')
    .replace(/import \{ getToken, listCompanies \} from .*?;/, 'const getToken = async () => ({}); const listCompanies = async () => [];')
    .replace(/import \{ getApontamentosReport, sampleOrigens, CAPIXABA_UUID \} from .*?;/, 'const getApontamentosReport = null, sampleOrigens = null, CAPIXABA_UUID = null;')
    .replace(/import\s*\{([^}]*getInventarioResumo[^}]*?)\}\s*from .*?;/, 'const {$1} = globalThis.__correctedRouteDeps;');
  await moduleFrom(router);
  const oldUsername = process.env.KARTADO_USERNAME, oldPassword = process.env.KARTADO_PASSWORD;
  process.env.KARTADO_USERNAME = 'fake'; process.env.KARTADO_PASSWORD = 'fake';
  const uuid = '067c811a-1fb4-4f97-9c34-9e68125da1c1';
  datasets.set(uuid, normal()); dataset(uuid).inv.totalCount = 4;
  const invoke = async (path, query) => {
    const res = { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; }, set(k, v) { this.headers[k] = v; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(path)({ query: { concessao: uuid, ...query } }, res); return res;
  };
  try {
    const processing = await invoke('/inventario/resumo', {});
    assert.equal(processing.statusCode, 202); assert.equal(processing.headers['Retry-After'], '15');
    assert.equal(processing.body.status, 'processando');
    const incompatible = await invoke('/inventario/cruzamento', { filtro: 'sem', status: 'Programado' });
    assert.equal(incompatible.statusCode, 400); assert.equal(incompatible.body.code, 'FILTRO_INCOMPATIVEL');
    const partial = await invoke('/inventario/cruzamento', { dimensao: 'ativo', filtro: 'sem' });
    assert.equal(partial.statusCode, 409); assert.ok(partial.body.detalhes.coleta);
  } finally {
    if (oldUsername === undefined) delete process.env.KARTADO_USERNAME; else process.env.KARTADO_USERNAME = oldUsername;
    if (oldPassword === undefined) delete process.env.KARTADO_PASSWORD; else process.env.KARTADO_PASSWORD = oldPassword;
  }
});
console.log(`\n${results.length} grupos de validação passaram. Sem chamadas remotas.`);
