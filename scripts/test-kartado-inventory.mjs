import assert from 'node:assert/strict';
import express from 'express';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createInventoryClient, inventoryParams, InventoryError, validateInventoryResponse } from '../server/services/kartado-inventory.service.mjs';
import { createInventoryRouter } from '../server/routes/kartado-inventory.mjs';

const company = '067c811a-1fb4-4f97-9c34-9e68125da1c1';
const asset = '349da6d1-0000-4000-8000-000000000001';
const env = { AGENTE_AUDITOR_BASE_URL: 'https://example.test', MONITORAMENTO_API_KEY: 'server-only-inventory-test-key' };
const query = { concessao: company };
const quality = { integridade: { completa: true, esperados: 2, recebidos: 2, faltando: 0, paginasFalhas: 0, motivos: [] }, atualidade: { geradoEm: '2026-10-22T12:00:00Z', idadeSeg: 10, validadeSeg: 21600, expirado: false }, atualizacao: { estado: 'ociosa' } };
const summary = { success: true, status: 'pronto', companyUuid: company, coletaCompleta: true, coleta: { inventario: quality }, avisos: [], totalInventarioConcessao: 2, totalRecebido: 2, totalFiltrado: 2, comFoto: 1, pctComFoto: 50,
  porClasse: [{ classe: 'Ponte', total: 2, comFoto: 1, pctComFoto: 50 }], porRodovia: [{ rodovia: 'SP-029', total: 2, comFoto: 1, pctComFoto: 50 }] };
const processing = { success: true, status: 'processando', etapa: 'inventario', iniciadoEm: '2026-10-22T12:00:00Z', decorridoSeg: 20, tentarNovamenteEmSeg: 15 };
const crossing = { success: true, status: 'pronto', companyUuid: company, coletaCompleta: true, coleta: { inventario: quality, apontamentos: quality }, avisos: [], dimensao: 'classe', periodo: 'recente', totais: { ativosNoRecorte: 2, ativosComApontamento: 1, ativosSemApontamento: 1, pctAtivosComApontamento: 50, apontamentosNoRecorte: 2 }, statusEncontrados: ['Executado', 'Programado'], linhas: [{ classe: 'Ponte', ativos: 2, ativosComApontamento: 1, ativosSemApontamento: 1, pctAtivosComApontamento: 50, apontamentos: 2, porStatus: { Executado: 1, Programado: 1 } }] };
const respond = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });
let count = 0;
async function test(name, body) { await body(); console.log(`PASS ${++count}: ${name}`); }

await test('Validação de UUID, filtros, enums, paginação e combinações incompatíveis', () => {
  for (const invalid of [null, {}, { concessao: '../secret' }, { ...query, classe: ['Ponte'] }, { ...query, refresh: 'true' }, { ...query, dimensao: 'other' }, { ...query, page: '0' }, { ...query, page_size: '1001' }, { ...query, filtro: 'sem', status: 'Programado' }]) {
    assert.throws(() => inventoryParams(invalid, 'cruzamento'), e => e instanceof InventoryError && e.status === 400);
  }
  assert.equal(inventoryParams({ ...query, classe: ' Ponte ' }, 'resumo').classe, 'Ponte');
});
await test('Adaptador preserva 202 e Retry-After sem expor chave ao navegador', async () => {
  let captured;
  const client = createInventoryClient({ env, fetchImpl: async (url, options) => { captured = { url, options }; return respond(processing, 202, { 'Retry-After': '27' }); } });
  const result = await client.request('resumo', { ...query, refresh: '1' });
  assert.equal(result.status, 202); assert.equal(result.retryAfter, 27);
  assert.equal(captured.url.origin, 'https://example.test');
  assert.equal(captured.url.pathname, '/api/v1/monitoramento/inventario/resumo');
  assert.equal(captured.url.searchParams.get('refresh'), '1');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.headers['x-api-key'], env.MONITORAMENTO_API_KEY);
  assert.equal(JSON.stringify(result).includes(env.MONITORAMENTO_API_KEY), false);
});
await test('Contrato antigo, concessão incorreta e metadados ausentes são rejeitados', () => {
  for (const payload of [{ ...summary, coleta: undefined }, { ...summary, companyUuid: asset }, { ...summary, coletaCompleta: undefined }, { ...summary, pctComFoto: undefined }, { ...summary, coleta: { inventario: { ...quality, atualidade: undefined } } }]) assert.throws(() => validateInventoryResponse(payload, 'resumo', query), e => e.code === 'INCOMPATIBLE_CONTRACT');
  assert.equal(validateInventoryResponse(summary, 'resumo', query), summary);
});
await test('Coleta parcial exige percentuais e ausência nulos em totais e grupos', () => {
  const partialQuality = structuredClone(quality); partialQuality.integridade.completa = false;
  const partial = { ...crossing, coletaCompleta: false, coleta: { inventario: partialQuality, apontamentos: quality } };
  const params = inventoryParams(query, 'cruzamento');
  assert.throws(() => validateInventoryResponse(partial, 'cruzamento', params));
  const valid = { ...partial, totais: { ...partial.totais, ativosSemApontamento: null, pctAtivosComApontamento: null }, linhas: partial.linhas.map(row => ({ ...row, ativosSemApontamento: null, pctAtivosComApontamento: null })) };
  assert.equal(validateInventoryResponse(valid, 'cruzamento', params), valid);
  assert.throws(() => validateInventoryResponse({ ...valid, coletaCompleta: true }, 'cruzamento', params));
});
await test('Status exige métricas adicionais sem substituir presença por status', () => {
  const params = inventoryParams({ ...query, status: 'Programado' }, 'cruzamento');
  assert.throws(() => validateInventoryResponse(crossing, 'cruzamento', params));
  const valid = { ...crossing, totais: { ...crossing.totais, ativosComApontamentoNoStatus: 1, apontamentosNoStatus: 1 }, linhas: crossing.linhas.map(row => ({ ...row, ativosComApontamentoNoStatus: 1, apontamentosNoStatus: 1 })) };
  assert.equal(validateInventoryResponse(valid, 'cruzamento', params).totais.ativosComApontamento, 1);
});
await test('Falhas de configuração, HTTPS e erros externos têm mensagens seguras', async () => {
  await assert.rejects(createInventoryClient({ env: {} }).request('resumo', query), e => e.status === 503);
  for (const base of ['http://example.test', 'https://user:password@example.test']) await assert.rejects(createInventoryClient({ env: { ...env, AGENTE_AUDITOR_BASE_URL: base } }).request('resumo', query), e => e.status === 503);
  for (const status of [401, 403, 500, 502, 429]) {
    await assert.rejects(createInventoryClient({ env, fetchImpl: async () => respond({ error: 'private-secret' }, status) }).request('resumo', query), e => !e.message.includes('private-secret') && !e.message.includes(env.MONITORAMENTO_API_KEY));
  }
  await assert.rejects(createInventoryClient({ env, fetchImpl: async () => { throw new DOMException('secret', 'TimeoutError'); } }).request('resumo', query), e => e.status === 504 && !e.message.includes('secret'));
});
await test('Detalhes paginados e histórico completo preservam contrato e caminhos fixos', async () => {
  const items = { success: true, companyUuid: company, pagina: 1, totalPaginas: 1, totalItens: 1, itens: [{ uuid: asset, numero: 'INV-1', classe: 'Ponte', rodovia: 'SP-029', link: null }] };
  const reports = { success: true, companyUuid: company, pagina: 1, totalPaginas: 1, totalApontamentos: 0, catalogosCompletos: true, avisos: [], apontamentos: [] };
  let url;
  const client = createInventoryClient({ env, fetchImpl: async value => { url = value; return respond(value.pathname.endsWith('/apontamentos') ? reports : items); } });
  assert.equal((await client.request('itens', query)).data.itens.length, 1);
  assert.equal((await client.request('apontamentos', query, asset)).data.totalApontamentos, 0);
  assert.equal(url.pathname, `/api/v1/monitoramento/inventario/${asset}/apontamentos`);
  await assert.rejects(client.request('apontamentos', query, '../other'), e => e.status === 400);
});

await test('Rotas exigem sessão, mantêm no-store, 202 e detalhes de 409', async () => {
  const app = express();
  let calls = 0;
  const client = createInventoryClient({ env, fetchImpl: async url => {
    calls++;
    if (url.pathname.endsWith('/resumo')) return respond(processing, 202, { 'Retry-After': '27' });
    if (url.searchParams.get('filtro') === 'sem') return respond({ success: false, code: 'COLETA_PARCIAL', error: 'private', detalhes: { coleta: crossing.coleta } }, 409);
    return respond(crossing);
  } });
  app.use('/inventory', createInventoryRouter({ authenticate: (req, res, next) => { if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: req.headers.authorization }; next(); }, client }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/inventory`;
  const headers = { Authorization: 'test-user' };
  try {
    assert.equal((await fetch(`${url}/resumo?concessao=${company}`)).status, 401); assert.equal(calls, 0);
    assert.equal((await fetch(`${url}/resumo?concessao=invalid`, { headers })).status, 400); assert.equal(calls, 0);
    const progress = await fetch(`${url}/resumo?concessao=${company}`, { headers });
    assert.equal(progress.status, 202); assert.equal(progress.headers.get('Retry-After'), '27'); assert.equal(progress.headers.get('Cache-Control'), 'no-store');
    const result = await fetch(`${url}/cruzamento?concessao=${company}`, { headers });
    assert.equal(result.status, 200); assert.equal(JSON.stringify(await result.json()).includes(env.MONITORAMENTO_API_KEY), false);
    const before = calls;
    assert.equal((await fetch(`${url}/cruzamento?concessao=${company}&filtro=sem&status=Programado`, { headers })).status, 400); assert.equal(calls, before);
    const partial = await fetch(`${url}/cruzamento?concessao=${company}&dimensao=ativo&filtro=sem`, { headers });
    assert.equal(partial.status, 409); assert.ok((await partial.json()).detalhes.coleta);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

await test('Cliente real do frontend acompanha 202, conserva query e cancela ao sair', async () => {
  const source = readFileSync(new URL('../src/services/kartadoInventoryService.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { followInventory } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const updates = [], paths = [], delays = [];
  let requests = 0;
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); queueMicrotask(fn); return 1; };
  globalThis.clearTimeout = () => {};
  globalThis.fetch = async (url, options) => { paths.push(url); assert.equal(options.credentials, 'same-origin'); return requests++ === 0 ? respond(processing, 202, { 'Retry-After': '23' }) : respond(summary); };
  try {
    await followInventory('resumo', `concessao=${company}&refresh=1`, new AbortController().signal, value => updates.push(value.status));
    assert.deepEqual(updates, ['processando', 'pronto']); assert.equal(paths[0], paths[1]); assert.deepEqual(delays, [23000]);
    const ctrl = new AbortController(); requests = 0;
    await assert.rejects(followInventory('resumo', `concessao=${company}`, ctrl.signal, () => ctrl.abort()), e => e.name === 'AbortError');
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; }
});
console.log(`\n${count} grupos de integração do inventário passaram.`);
