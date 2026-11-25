import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import express from 'express';
import { createReportingMapClient, mapParams } from '../server/services/kartado-reporting-map.service.mjs';
import { createReportingMapRouter } from '../server/routes/kartado-reporting-map.mjs';

const company = '882c7a1a-bfb2-4766-9993-90eeead59662';
const uuid = '00014854-55d0-41ca-873d-09c76b6613b3';
const params = { company, from: '2026-09-24', to: '2026-10-23', page: '1' };
for (const invalid of [
  { company: '../x' },
  { from: '2026-02-30' },
  { from: '2026-99-99' },
  { from: '2026-11-01' },
  { from: '2020-01-01' },
  { page: '101' },
  { company: [company] },
])
  assert.throws(
    () => mapParams({ ...params, ...invalid }),
    (error) => error.status === 400,
  );
const record = {
  id: uuid,
  attributes: {
    number: 'TEST-01',
    foundAt: '2026-10-05T09:00:00-03:00',
    point: { type: 'Point', coordinates: [-41, -17] },
    roadName: 'BR-116/MG',
    km: 0,
  },
  relationships: {
    company: { data: { id: company } },
    status: { data: { id: 'status' } },
    occurrenceType: { data: { id: 'classe' } },
  },
};
const calls = [];
const read = async (path, query) => {
  calls.push({ path, query });
  return {
    data:
      path === '/Reporting/'
        ? [record]
        : [
            {
              id: path === '/OccurrenceType/' ? 'classe' : 'status',
              attributes: { name: path === '/OccurrenceType/' ? 'Monitoração' : 'Executado' },
            },
          ],
    meta: { pagination: { count: 1, pages: 1 } },
  };
};
const client = createReportingMapClient({ read });
const result = await client.page(params);
assert.deepEqual(result.classes, ['Monitoração']);
assert.equal(result.items[0].status, 'Executado');
assert.equal(result.items[0].classe, 'Monitoração');
assert.deepEqual(result.items[0].coordinates, [-41, -17]);
assert.equal(result.items[0].km, 0);
assert.equal(calls.find((c) => c.path === '/Reporting/').query.found_at_after, params.from);
assert.ok(calls.find((c) => c.path === '/Reporting/').query['fields[Reporting]'].includes('point'));
await client.page(params);
assert.equal(calls.filter((c) => c.path === '/OccurrenceType/').length, 1);
assert.throws(
  () => mapParams({ ...params, classe: ['invalid'] }),
  (error) => error.status === 400,
);
assert.throws(
  () => mapParams({ ...params, classe: 'x'.repeat(301) }),
  (error) => error.status === 400,
);
const filteredCalls = [];
const filteredClient = createReportingMapClient({
  read: async (path, query) => {
    filteredCalls.push({ path, query });
    return read(path, query);
  },
});
await filteredClient.page({ ...params, classe: 'Monitoração' });
assert.equal(filteredCalls.find((call) => call.path === '/Reporting/').query.occurrence_type, 'classe');
assert.throws(
  () => mapParams({ ...params, from: '', to: '' }),
  (error) => error.status === 400,
);
assert.throws(
  () => mapParams({ ...params, period: 'all' }),
  (error) => error.status === 400,
);
const historicalCalls = [];
const historical = await createReportingMapClient({
  read: async (path, query) => {
    historicalCalls.push({ path, query });
    const response = await read(path, query);
    return path === '/Reporting/'
      ? { ...response, data: [{ ...record, attributes: { ...record.attributes, foundAt: '2022-01-29T00:00' } }] }
      : response;
  },
}).page({ ...params, from: '', to: '', period: 'all', classe: 'Monitoração' });
assert.equal(historical.items[0].encontradoEm, '2022-01-29');
const historicalQuery = historicalCalls.find((call) => call.path === '/Reporting/').query;
assert.equal(historicalQuery.occurrence_type, 'classe');
assert.ok(!('found_at_after' in historicalQuery));
assert.ok(!('found_at_before' in historicalQuery));
await assert.rejects(filteredClient.page({ ...params, classe: 'Inexistente' }), (error) => error.status === 400);
await assert.rejects(
  createReportingMapClient({
    read: async (path, query) => {
      const response = await read(path, query);
      return path === '/Reporting/'
        ? {
            ...response,
            data: [
              {
                ...record,
                relationships: { ...record.relationships, occurrenceType: { data: { id: 'another-class' } } },
              },
            ],
          }
        : response;
    },
  }).page({ ...params, classe: 'Monitoração' }),
);
const changed = (value) =>
  createReportingMapClient({ read: async (path, query) => (path === '/Reporting/' ? value : read(path, query)) });
await assert.rejects(
  changed({
    data: [{ ...record, relationships: { company: { data: { id: uuid } } } }],
    meta: { pagination: { count: 1, pages: 1 } },
  }).page(params),
);
await assert.rejects(
  changed({
    data: [{ ...record, attributes: { ...record.attributes, foundAt: '2020-01-01' } }],
    meta: { pagination: { count: 1, pages: 1 } },
  }).page(params),
);
const missing = await changed({
  data: [{ ...record, attributes: { ...record.attributes, point: { type: 'Point', coordinates: [181, 91] } } }],
  meta: { pagination: { count: 1, pages: 1 } },
}).page(params);
assert.equal(missing.items[0].coordinates, null);
const withoutCatalog = await createReportingMapClient({
  read: async (path, query) => {
    if (path !== '/Reporting/') throw new Error('Catalog failed');
    return read(path, query);
  },
}).page(params);
assert.ok(withoutCatalog.avisos.length);
assert.equal(withoutCatalog.items.length, 1);
const catalogPages = [];
const pagedCatalogClient = createReportingMapClient({
  read: async (path, query) => {
    if (path !== '/OccurrenceType/') return read(path, query);
    catalogPages.push(query.page);
    return {
      data: [
        {
          id: query.page === '1' ? 'absent-class' : 'classe',
          attributes: { name: query.page === '1' ? 'Classe sem apontamento no período' : 'Monitoração' },
        },
      ],
      meta: { pagination: { page: Number(query.page), count: 2, pages: 2 } },
    };
  },
});
const paginatedClasses = await pagedCatalogClient.page(params);
assert.deepEqual(catalogPages, ['1', '2']);
assert.equal(paginatedClasses.items[0].classe, 'Monitoração');
assert.deepEqual(paginatedClasses.classes, ['Classe sem apontamento no período', 'Monitoração']);
const partialCatalog = await createReportingMapClient({
  read: async (path, query) => {
    if (path !== '/OccurrenceType/') return read(path, query);
    if (query.page === '2') throw new Error('Failed second page');
    return {
      data: [{ id: 'first-class', attributes: { name: 'Classe preservada' } }],
      meta: { pagination: { count: 2, pages: 2 } },
    };
  },
}).page(params);
assert.deepEqual(partialCatalog.classes, ['Classe preservada']);
assert.ok(partialCatalog.avisos.length);

// A coleta da base do mapa usa páginas maiores e passa do limite de 100 páginas.
let collectorQuery;
await createReportingMapClient({
  read: async (path, query) => {
    if (path !== '/Reporting/') return read(path, query);
    collectorQuery = query;
    return { data: { results: [], meta: { pagination: { count: 0, pages: 0 } } } };
  },
}).page({ ...params, from: '', to: '', period: 'all', page: '250' }, { pageSize: 500, maxPage: Infinity });
assert.equal(collectorQuery.page_size, '500');
assert.equal(collectorQuery.page, '250');
assert.throws(
  () => mapParams({ ...params, page: '101' }),
  (error) => error.status === 400,
);

const source = readFileSync(new URL('../src/services/kartadoMapService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { mapStatus, initialMapDates, heatCells, searchMapClasses, fetchMapPoints, fetchMapSummary } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
assert.deepEqual(
  searchMapClasses(['Monitoração de Sinalização Vertical', 'Implantação de Placas'], 'sinalizacao MONITORACAO'),
  ['Monitoração de Sinalização Vertical'],
);
assert.deepEqual(searchMapClasses(['Monitoração'], 'inexistente'), []);
assert.equal(mapStatus('Em execução'), 'progress');
assert.equal(mapStatus('Executado'), 'completed');
assert.equal(mapStatus('Programado'), 'pending');
assert.equal(mapStatus('Cancelado'), 'other');
const cells = [
  [-20, -43, 5, 2],
  [-21, -44, 3, 0],
  [91, -44, 1, 1], // fora da projeção do mapa
];
assert.deepEqual(heatCells(cells), [
  [-20, -43, 5],
  [-21, -44, 3],
]);
assert.deepEqual(heatCells(cells, true), [[-20, -43, 2]]);
assert.equal((Date.parse(initialMapDates().to) - Date.parse(initialMapDates().from)) / 86400000, 29);

// O navegador envia os filtros e a área ao servidor e valida a resposta.
const realFetch = globalThis.fetch;
let requested;
try {
  globalThis.fetch = async (url) => {
    requested = new URL(url, 'http://localhost');
    return Response.json({ success: true, total: 2, items: [] });
  };
  const filters = { from: '', to: '', status: 'Executado', classe: '', rodovia: 'MG-050' };
  await fetchMapPoints(
    params.company,
    filters,
    { west: -44, south: -21, east: -43, north: -20 },
    { pendingOnly: true },
  );
  assert.equal(requested.pathname, '/api/kartado-reporting-map/pontos');
  assert.equal(requested.searchParams.get('status'), 'Executado');
  assert.equal(requested.searchParams.get('rodovia'), 'MG-050');
  assert.equal(requested.searchParams.has('from'), false);
  assert.equal(requested.searchParams.get('pendentes'), '1');
  assert.equal(requested.searchParams.get('bbox'), '-44.000000,-21.000000,-43.000000,-20.000000');
  globalThis.fetch = async () => Response.json({ success: true, total: 1 });
  await assert.rejects(fetchMapSummary(params.company, filters), /inválida/);
  globalThis.fetch = async () => Response.json({ success: false, error: 'Unidade inválida.' }, { status: 400 });
  await assert.rejects(fetchMapSummary(params.company, filters), /Unidade inválida/);
} finally {
  globalThis.fetch = realFetch;
}

// Rotas: sessão obrigatória, validação e pedido de atualização.
const app = express();
const routeCalls = [];
let ticks = 0;
const sync = { state: 'ociosa', last_success_at: new Date(), next_run_at: new Date(), last_error: null };
app.use(
  '/map',
  createReportingMapRouter({
    authenticate: (req, res, next) => (req.headers.authorization ? next() : res.sendStatus(401)),
    worker: { tick: async () => void ticks++ },
    repository: {
      ensure: async (company) => routeCalls.push(['ensure', company]),
      sync: async () => sync,
      summary: async (filters) => {
        routeCalls.push(['summary', filters]);
        return { total: 1, mapped: 1, cells: [[-20, -43, 1, 0]], options: { status: [], classes: [], rodovias: [] } };
      },
      points: async (filters, bounds, options) => {
        routeCalls.push(['points', bounds, options]);
        return { total: 0, items: [] };
      },
      list: async (filters, page) => ({ total: 0, pages: 1, page, items: [] }),
      requestRefresh: async () => true,
      prioritize: async (company) => routeCalls.push(['prioritize', company]),
    },
  }),
);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}/map`;
  const auth = { headers: { Authorization: 'test-session' } };
  const summaryUrl = `${base}/resumo?company=${params.company}`;
  assert.equal((await fetch(summaryUrl)).status, 401);
  assert.equal(routeCalls.length, 0);
  const response = await fetch(summaryUrl, auth);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.coleta.estado, 'ociosa');
  assert.deepEqual(body.cells, [[-20, -43, 1, 0]]);
  assert.equal(ticks, 0); // base já coletada: não antecipa a coleta
  assert.equal((await fetch(`${base}/resumo?company=x`, auth)).status, 400);
  assert.equal((await fetch(`${summaryUrl}&from=2026-10-01`, auth)).status, 400);
  assert.equal((await fetch(`${summaryUrl}&from=2026-10-02&to=2026-10-01`, auth)).status, 400);
  assert.equal((await fetch(`${base}/pontos?company=${params.company}&bbox=1,2,3`, auth)).status, 400);
  assert.equal((await fetch(`${base}/pontos?company=${params.company}&bbox=-44,-21,-43,-20&lat=x`, auth)).status, 400);
  const points = await fetch(`${base}/pontos?company=${params.company}&bbox=-44,-21,-43,-20&limit=99999`, auth);
  assert.equal(points.status, 200);
  const [, bounds, options] = routeCalls.find(([kind]) => kind === 'points');
  assert.deepEqual(bounds, { west: -44, south: -21, east: -43, north: -20 });
  assert.equal(options.limit, 3000);
  assert.equal((await fetch(`${base}/lista?company=${params.company}&page=0`, auth)).status, 400);
  const refresh = await fetch(`${base}/atualizar?company=${params.company}`, { ...auth, method: 'POST' });
  assert.equal(refresh.status, 200);
  assert.equal((await refresh.json()).aceito, true);
  assert.equal(ticks, 1);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  'Mapa da unidade: período, coordenadas, catálogos, isolamento, páginas da coleta, filtros, calor, sessão e rotas da base OK.',
);
