import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import express from 'express';
import { createReportingMapClient, mapParams } from '../server/services/kartado-reporting-map.service.mjs';
import { createReportingMapRouter } from '../server/routes/kartado-reporting-map.mjs';

const company = '882c7a1a-bfb2-4766-9993-90eeead59662';
const uuid = '00014854-55d0-41ca-873d-09c76b6613b3';
const params = { company, from: '2026-09-24', to: '2026-10-23', page: '1' };
for (const invalid of [{ company: '../x' }, { from: '2026-02-30' }, { from: '2026-99-99' }, { from: '2026-11-01' }, { from: '2020-01-01' }, { page: '101' }, { company: [company] }]) assert.throws(() => mapParams({ ...params, ...invalid }), error => error.status === 400);
const record = { id: uuid, attributes: { number: 'TEST-01', foundAt: '2026-10-05T09:00:00-03:00', point: { type: 'Point', coordinates: [-41, -17] }, roadName: 'BR-116/MG', km: 0 }, relationships: { company: { data: { id: company } }, status: { data: { id: 'status' } }, occurrenceType: { data: { id: 'classe' } } } };
const calls = [];
const read = async (path, query) => {
  calls.push({ path, query });
  return { data: path === '/Reporting/' ? [record] : [{ id: path === '/OccurrenceType/' ? 'classe' : 'status', attributes: { name: path === '/OccurrenceType/' ? 'Monitoração' : 'Executado' } }], meta: { pagination: { count: 1, pages: 1 } } };
};
const client = createReportingMapClient({ read });
const result = await client.page(params);
assert.deepEqual(result.classes, ['Monitoração']);
assert.equal(result.items[0].status, 'Executado'); assert.equal(result.items[0].classe, 'Monitoração');
assert.deepEqual(result.items[0].coordinates, [-41, -17]); assert.equal(result.items[0].km, 0);
assert.equal(calls.find(c => c.path === '/Reporting/').query.found_at_after, params.from);
assert.ok(calls.find(c => c.path === '/Reporting/').query['fields[Reporting]'].includes('point'));
await client.page(params); assert.equal(calls.filter(c => c.path === '/OccurrenceType/').length, 1);
const changed = value => createReportingMapClient({ read: async (path, query) => path === '/Reporting/' ? value : read(path, query) });
await assert.rejects(changed({ data: [{ ...record, relationships: { company: { data: { id: uuid } } } }], meta: { pagination: { count: 1, pages: 1 } } }).page(params));
await assert.rejects(changed({ data: [{ ...record, attributes: { ...record.attributes, foundAt: '2020-01-01' } }], meta: { pagination: { count: 1, pages: 1 } } }).page(params));
const missing = await changed({ data: [{ ...record, attributes: { ...record.attributes, point: { type: 'Point', coordinates: [181, 91] } } }], meta: { pagination: { count: 1, pages: 1 } } }).page(params);
assert.equal(missing.items[0].coordinates, null);
const withoutCatalog = await createReportingMapClient({ read: async (path, query) => { if (path !== '/Reporting/') throw new Error('Catalog failed'); return read(path, query); } }).page(params);
assert.ok(withoutCatalog.avisos.length); assert.equal(withoutCatalog.items.length, 1);
const catalogPages = [];
const pagedCatalogClient = createReportingMapClient({ read: async (path, query) => {
  if (path !== '/OccurrenceType/') return read(path, query);
  catalogPages.push(query.page);
  return { data: [{ id: query.page === '1' ? 'absent-class' : 'classe', attributes: { name: query.page === '1' ? 'Classe sem apontamento no período' : 'Monitoração' } }], meta: { pagination: { page: Number(query.page), count: 2, pages: 2 } } };
} });
const paginatedClasses = await pagedCatalogClient.page(params);
assert.deepEqual(catalogPages, ['1', '2']);
assert.equal(paginatedClasses.items[0].classe, 'Monitoração');
assert.deepEqual(paginatedClasses.classes, ['Classe sem apontamento no período', 'Monitoração']);
const partialCatalog = await createReportingMapClient({ read: async (path, query) => {
  if (path !== '/OccurrenceType/') return read(path, query);
  if (query.page === '2') throw new Error('Failed second page');
  return { data: [{ id: 'first-class', attributes: { name: 'Classe preservada' } }], meta: { pagination: { count: 2, pages: 2 } } };
} }).page(params);
assert.deepEqual(partialCatalog.classes, ['Classe preservada']); assert.ok(partialCatalog.avisos.length);

const source = readFileSync(new URL('../src/services/kartadoMapService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { loadMapReportings, mapStatus, initialMapDates, heatMapItems, nearbyMapItems, mapClassOptions } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
assert.deepEqual(mapClassOptions({ classes: ['Sem ocorrência', 'Monitoração'], items: [{ classe: 'Monitoração' }, { classe: 'Classe não identificada' }] }), ['Classe não identificada', 'Monitoração', 'Sem ocorrência']);
assert.equal(mapStatus('Em execução'), 'progress'); assert.equal(mapStatus('Executado'), 'completed'); assert.equal(mapStatus('Programado'), 'pending'); assert.equal(mapStatus('Cancelado'), 'other');
const heatRecords = [
  { uuid: 'completed', status: 'Executado', coordinates: [10, 10] },
  { uuid: 'pending', status: 'Identificado', coordinates: [10, 10] },
  { uuid: 'progress', status: 'Em execução', coordinates: [20, 10] },
  { uuid: 'scheduled', status: 'Programado', coordinates: [60, 10] },
  { uuid: 'missing', status: 'Pendente', coordinates: null },
  { uuid: 'invalid', status: 'Pendente', coordinates: [181, 10] },
  { uuid: 'cancelled', status: 'Cancelado', coordinates: [100, 10] },
];
const heat = heatMapItems(heatRecords);
assert.equal(heat.length, 5); // Mantém a contagem de dois registros na mesma coordenada.
assert.deepEqual(heatMapItems(heatRecords, true).map(item => item.uuid), ['pending', 'progress', 'scheduled']);
const nearby = nearbyMapItems(heat, { x: 10, y: 10 }, point => ({ x: point[0], y: point[1] }), 50);
assert.deepEqual(nearby.map(item => item.uuid), ['completed', 'pending', 'progress', 'scheduled']);
assert.equal(nearbyMapItems(heat, { x: 0, y: 0 }, point => ({ x: point[0], y: point[1] }), 5).length, 0);
assert.equal(heatMapItems([], true).length, 0);
assert.equal((Date.parse(initialMapDates().to) - Date.parse(initialMapDates().from)) / 86400000, 29);
let active = 0, maximum = 0;
const mockPage = async (_company, _from, _to, page) => {
  active++; maximum = Math.max(active, maximum);
  await new Promise(resolve => setImmediate(resolve)); active--;
  return { success: true, company, pagina: page, paginas: 7, total: 7, classes: page === 1 ? ['Classe sem apontamentos'] : [], items: [{ uuid: `id-${page}`, coordinates: [-41, -17] }], avisos: [] };
};
const complete = await loadMapReportings(company, params.from, params.to, new AbortController().signal, () => {}, mockPage);
assert.equal(complete.items.length, 7); assert.equal(complete.partial, false); assert.equal(maximum, 3);
assert.deepEqual(complete.classes, ['Classe sem apontamentos']);
const partial = await loadMapReportings(company, params.from, params.to, new AbortController().signal, () => {}, async (...args) => { if (args[3] === 3) throw new Error('failed'); return mockPage(...args); });
assert.equal(partial.partial, true); assert.equal(partial.items.length, 6); assert.ok(partial.warnings.some(w => w.includes('3')));
const controller = new AbortController(); let reads = 0;
await assert.rejects(loadMapReportings(company, params.from, params.to, controller.signal, () => controller.abort(), async (...args) => { reads++; return mockPage(...args); }), error => error.name === 'AbortError');
assert.equal(reads, 1);

const app = express(); let apiCalls = 0;
app.use('/map', createReportingMapRouter({ authenticate: (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401), client: { page: async () => { apiCalls++; return result; } } }));
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}/map?${new URLSearchParams(params)}`;
  assert.equal((await fetch(url)).status, 401); assert.equal(apiCalls, 0);
  const response = await fetch(url, { headers: { Authorization: 'test-session' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log('Mapa da unidade: período, coordenadas, catálogos, sessão, isolamento, paginação progressiva, concorrência e cancelamento OK.');
