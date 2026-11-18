// Base do mapa de apontamentos: coleta, gerações, consultas, lease e agendamento das 04:00,
// com o SQL real executado num PostgreSQL em memória (PGlite).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  collectCompany,
  createMapRepository,
  createMapWorker,
  mapBounds,
  mapFilters,
  nextDailyRun,
  statusGroup,
  syncOut,
} from '../server/services/kartado-map-snapshots.mjs';

// Agendamento: 04:00 de Brasília = 07:00 UTC, sempre no futuro.
assert.equal(nextDailyRun(new Date('2026-11-18T06:59:00Z')).toISOString(), '2026-11-18T07:00:00.000Z');
assert.equal(nextDailyRun(new Date('2026-11-18T07:00:00Z')).toISOString(), '2026-11-19T07:00:00.000Z');
assert.equal(nextDailyRun(new Date('2026-12-31T23:30:00Z')).toISOString(), '2027-01-01T07:00:00.000Z');
assert.equal(statusGroup('Em execução'), 'progress');
assert.equal(statusGroup('Concluído'), 'completed');
assert.equal(statusGroup(' identificado '), 'pending');
assert.equal(statusGroup('Cancelado'), 'other');

const company = '11111111-1111-4111-8111-111111111111';
assert.throws(
  () => mapFilters({ company: 'x' }),
  (error) => error.status === 400,
);
assert.throws(
  () => mapFilters({ company, from: '2026-01-01' }),
  (error) => error.status === 400,
);
assert.throws(
  () => mapFilters({ company, classe: ['a'] }),
  (error) => error.status === 400,
);
assert.deepEqual(mapFilters({ company: company.toUpperCase() }), {
  company,
  from: '',
  to: '',
  status: '',
  classe: '',
  rodovia: '',
});
assert.throws(
  () => mapBounds('-44,-20,-43,-21'),
  (error) => error.status === 400,
);
assert.deepEqual(mapBounds('-44,-21,-43,-20'), { west: -44, south: -21, east: -43, north: -20 });

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n, extra = {}) => ({
  uuid: uuid(n),
  numero: n,
  rodovia: n % 2 ? 'MG-050' : 'BR-381',
  km: String(n),
  encontradoEm: `2026-0${(n % 9) + 1}-15`,
  classe: n % 3 ? 'Drenagem' : 'Pavimento',
  status: n % 4 ? 'Executado' : 'Identificado',
  coordinates: [-43 - n / 1000, -20 - n / 1000],
  ...extra,
});

const db = new PGlite();
try {
  await db.exec(await readFile(new URL('../azure/kartado-map-schema.sql', import.meta.url), 'utf8'));
  const execute = (sql, args) => db.query(sql, args);
  const repository = createMapRepository({ execute });
  await repository.registerCompanies([{ uuid: company, name: 'Unidade A' }]);
  await repository.registerCompanies([{ uuid: company, name: 'Unidade A renomeada' }]);
  assert.equal((await repository.sync(company)).company_name, 'Unidade A renomeada');

  // Coleta com 3 páginas; a página 2 falha uma vez e se recupera na nova tentativa.
  const pages = { 1: [item(1), item(2)], 2: [item(3), item(4, { coordinates: null })], 3: [item(5)] };
  let failures = 1;
  const client = {
    page: async (query, options) => {
      assert.equal(options.pageSize, 500);
      assert.equal(query.period, 'all');
      if (query.page === '2' && failures-- > 0) throw new Error('Kartado instável');
      return { total: 5, paginas: 3, items: pages[query.page] };
    },
  };
  const waits = [];
  let run = await repository.claim();
  assert.ok(run, 'unidade nova é coletada imediatamente');
  const runCompany = run.company_uuid;
  assert.equal(await repository.claim(), null, 'lease impede coleta dupla');
  let result = await collectCompany({ run, repository, client, wait: async (ms) => void waits.push(ms) });
  assert.deepEqual(result, { failed: 0, received: 5, done: 3, pages: 3, finished: true });
  assert.deepEqual(waits, [2000]);
  await repository.finish(run, { complete: true, now: new Date('2026-11-18T12:00:00Z') });
  let sync = await repository.sync(runCompany);
  assert.equal(sync.state, 'ociosa');
  assert.equal(sync.records_total, 5);
  assert.equal(sync.lease_token, null);
  assert.equal(new Date(sync.next_run_at).toISOString(), '2026-11-19T07:00:00.000Z');
  assert.ok(sync.last_success_at);
  assert.equal(syncOut(sync).estado, 'ociosa');

  // Consultas da base.
  const all = mapFilters({ company: runCompany });
  let summary = await repository.summary(all);
  assert.equal(summary.total, 5);
  assert.equal(summary.mapped, 4);
  assert.equal(summary.cells.length, 4);
  assert.deepEqual(summary.options.rodovias, ['BR-381', 'MG-050']);
  assert.deepEqual(summary.options.status, ['Executado', 'Identificado']);
  const pendingCells = summary.cells.filter((cell) => cell[3] > 0);
  assert.equal(pendingCells.length, 0, 'item 4 (pendente) não tem coordenadas');
  summary = await repository.summary(mapFilters({ company: runCompany, rodovia: 'MG-050' }));
  assert.equal(summary.total, 3);
  summary = await repository.summary(mapFilters({ company: runCompany, from: '2026-02-01', to: '2026-03-31' }));
  assert.equal(summary.total, 2);
  const area = { west: -44, south: -21, east: -42, north: -19 };
  let points = await repository.points(all, area, { limit: 3 });
  assert.deepEqual(points, { total: 4, items: [] }, 'acima do limite: só o total');
  points = await repository.points(all, area, { limit: 10 });
  assert.equal(points.items.length, 4);
  assert.deepEqual(Object.keys(points.items[0]).sort(), [
    'classe',
    'coordinates',
    'encontradoEm',
    'km',
    'numero',
    'rodovia',
    'status',
    'uuid',
  ]);
  points = await repository.points(all, area, { limit: 2, center: { lat: -20.0045, lon: -43.0045 } });
  assert.equal(points.total, 4);
  assert.deepEqual(
    points.items.map((value) => value.uuid),
    [uuid(5), uuid(3)],
    'com centro, devolve os mais próximos mesmo acima do limite',
  );
  const list = await repository.list(all, 1);
  assert.equal(list.total, 5);
  assert.equal(list.pages, 1);
  assert.equal(list.items.find((value) => value.uuid === uuid(4)).coordinates, null);
  assert.equal(list.items.find((value) => value.uuid === uuid(1)).km, 1);

  // Pedido manual: antecipa a coleta, com intervalo mínimo de 5 minutos.
  assert.equal(await repository.requestRefresh(runCompany), true);
  assert.equal(await repository.requestRefresh(runCompany), false);

  // Nova coleta completa sem o item 5 (excluído na origem): ele sai da base.
  pages[3] = [];
  run = await repository.claim();
  assert.equal(run.company_uuid, runCompany);
  result = await collectCompany({ run, repository, client, wait: async () => {} });
  await repository.finish(run, { complete: true });
  assert.equal((await repository.summary(all)).total, 4);

  // Coleta incompleta: preserva a base anterior e tenta de novo em 1 hora.
  await db.query('update kartado_map_sync set next_run_at=now() where company_uuid=$1', [runCompany]);
  run = await repository.claim();
  failures = 99;
  pages[3] = [item(6)];
  result = await collectCompany({ run, repository, client, wait: async () => {} });
  assert.equal(result.failed, 1);
  const now = new Date('2026-11-18T12:00:00Z');
  await repository.finish({ ...run, pages_done_ok: true }, { complete: false, error: 'falhou', now });
  sync = await repository.sync(runCompany);
  assert.equal(sync.state, 'incompleta');
  assert.equal(new Date(sync.next_run_at).toISOString(), '2026-11-18T13:00:00.000Z');
  assert.equal((await repository.summary(all)).total, 5, 'mantém os anteriores e soma o item novo');
  assert.equal(syncOut(sync).erro, 'falhou');

  // Lease perdida (outra instância assumiu): a coleta para sem encerrar.
  await db.query('update kartado_map_sync set next_run_at=now() where company_uuid=$1', [runCompany]);
  run = await repository.claim();
  await db.query('update kartado_map_sync set lease_token=gen_random_uuid() where company_uuid=$1', [runCompany]);
  failures = 0;
  assert.deepEqual(await collectCompany({ run, repository, client, wait: async () => {} }), { lost: true });

  // Worker: registra unidades, coleta a próxima pendente e registra erro de banco uma vez.
  await db.query("update kartado_map_sync set lease_until=null, lease_token=null, next_run_at=now()+interval '1 day'");
  const logs = [];
  const third = '33333333-3333-4333-8333-333333333333';
  const worker = createMapWorker({
    repository,
    client: { page: async () => ({ total: 1, paginas: 1, items: [item(7)] }) },
    companies: async () => [{ uuid: third, name: 'Unidade C', extra: true }],
    enabled: () => true,
    log: (message) => logs.push(message),
  });
  await worker.tick();
  sync = await repository.sync(third);
  assert.equal(sync.state, 'ociosa');
  assert.equal(sync.records_total, 1);
  assert.match(logs[0], /Unidade C: 1 apontamentos na base/);

  // Etapas e prioridade: uma unidade grande devolve a vez a cada etapa, a unidade aberta
  // no mapa passa à frente e a grande continua de onde parou, na mesma geração.
  const big = '44444444-4444-4444-8444-444444444444';
  const viewed = '55555555-5555-4555-8555-555555555555';
  await repository.registerCompanies([{ uuid: big, name: 'Grande' }]);
  await db.query("update kartado_map_sync set next_run_at=now()-interval '1 minute' where company_uuid=$1", [big]);
  const bigPages = { 1: [item(11)], 2: [item(12)], 3: [item(13)] };
  const bigClient = { page: async (query) => ({ total: 3, paginas: 3, items: bigPages[query.page] }) };
  run = await repository.claim();
  assert.equal(run.company_uuid, big);
  const bigGeneration = run.generation;
  result = await collectCompany({ run, repository, client: bigClient, maxPages: 2 });
  assert.deepEqual(result, { failed: 0, received: 2, done: 2, pages: 3, finished: false });
  await repository.pause(run);
  assert.equal(syncOut(await repository.sync(big)).estado, 'em_andamento', 'pausada entre etapas segue em andamento');
  assert.equal(syncOut(await repository.sync(big)).paginas, 2);
  await repository.registerCompanies([{ uuid: viewed, name: 'Aberta no mapa' }]);
  await repository.prioritize(viewed);
  run = await repository.claim();
  assert.equal(run.company_uuid, viewed, 'a unidade aberta no mapa passa à frente');
  await collectCompany({
    run,
    repository,
    client: { page: async () => ({ total: 1, paginas: 1, items: [item(21)] }) },
  });
  await repository.finish(run, { complete: true });
  assert.equal((await repository.sync(viewed)).requested_at, null);
  await repository.prioritize(viewed);
  assert.equal((await repository.sync(viewed)).requested_at, null, 'unidade com base não ganha prioridade');
  run = await repository.claim();
  assert.equal(run.company_uuid, big);
  assert.equal(run.generation, bigGeneration, 'retomada mantém a geração');
  assert.equal(run.pages_done, 2);
  result = await collectCompany({ run, repository, client: bigClient, maxPages: 2 });
  assert.deepEqual(result, { failed: 0, received: 1, done: 3, pages: 3, finished: true });
  await repository.finish(run, { complete: true });
  assert.equal((await repository.summary(mapFilters({ company: big }))).total, 3);
  // Servidor reiniciado no meio de uma etapa: a lease vence e a coleta retoma do mesmo ponto.
  await db.query("update kartado_map_sync set next_run_at=now()-interval '1 minute' where company_uuid=$1", [big]);
  run = await repository.claim();
  await collectCompany({ run, repository, client: bigClient, maxPages: 1 });
  await db.query("update kartado_map_sync set lease_until=now()-interval '1 second' where company_uuid=$1", [big]);
  const resumed = await repository.claim();
  assert.equal(resumed.generation, run.generation);
  assert.equal(resumed.pages_done, 1);
  const broken = createMapWorker({
    repository: { ...repository, claim: async () => Promise.reject(new Error('relation does not exist')) },
    client,
    companies: async () => [],
    enabled: () => true,
    log: (message) => logs.push(message),
  });
  await broken.tick();
  await broken.tick();
  assert.equal(logs.filter((message) => message.includes('db:migrate-kartado-map')).length, 1);
  let disabledCalls = 0;
  await createMapWorker({
    repository: { claim: async () => void disabledCalls++ },
    enabled: () => false,
  }).tick();
  assert.equal(disabledCalls, 0);
} finally {
  await db.close();
}
console.log(
  'Base do mapa: agendamento 04:00, coleta em etapas, prioridade, retomada, gerações, falhas, lease, filtros, calor, pontos e lista OK.',
);
