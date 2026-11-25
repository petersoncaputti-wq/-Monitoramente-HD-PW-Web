import assert from 'node:assert/strict';
import express from 'express';
import { createDataRouter } from '../server/routes/data.mjs';
import {
  normalizeTotvsOpenedAt,
  mapTotvsImports,
  consolidateTotvsImports,
  mentionsTotvs,
} from '../server/services/totvs-data.service.mjs';

assert.equal(normalizeTotvsOpenedAt('2026-03-14T23:59:59'), '2026-03-14');
assert.equal(normalizeTotvsOpenedAt('2024-02-29'), '2024-02-29');
for (const value of [null, '', 46000, '14/03/2026', '2026-02-29T12:00:00', '2026-13-01', 'invalid']) {
  assert.equal(normalizeTotvsOpenedAt(value), null);
}
const rows = [
  {
    ticket_id: '12345',
    description: 'Atualizado',
    requester_organization: 'Ecovias Rio Minas',
    opened_at: '2026-03-14T23:59:59',
  },
  {
    ticket_id: '12345',
    description: 'Versão anterior',
    requester_organization: 'Outra',
    opened_at: '2026-03-13T12:00:00',
  },
  { ticket_id: '67890', description: 'Sem data', requester_organization: null, opened_at: null },
  { ticket_id: null, description: 'Não é chamado' },
];
const expected = [
  {
    ticket_id: '12345',
    description: 'Atualizado',
    requester_organization: 'Ecovias Rio Minas',
    opened_at: '2026-03-14',
    mentions_totvs: false,
  },
  { ticket_id: '67890', description: 'Sem data', requester_organization: '', opened_at: null, mentions_totvs: false },
];
assert.deepEqual(mapTotvsImports(rows), expected);
assert.deepEqual(mapTotvsImports([]), []);

// Importação mais nova sem a organização (relatório sem as colunas do solicitante):
// a organização da importação anterior é preservada; o resto vem da mais nova.
const merged = mapTotvsImports([
  { ticket_id: '1-1', description: 'Erro TCOP', requester_organization: '', opened_at: '2026-10-02', reason: '' },
  { ticket_id: '1-1', description: 'Antigo', requester_organization: 'Eco101', opened_at: '2026-10-01' },
  {
    ticket_id: '2-2',
    description: 'Acesso MGI',
    requester_organization: null,
    opened_at: '2026-10-03',
    reason: 'TOTVS',
  },
  { ticket_id: '3-3', description: 'Impressora', requester_organization: 'Ecosul', opened_at: '2026-10-04' },
]);
assert.deepEqual(
  merged.find((t) => t.ticket_id === '1-1'),
  {
    ticket_id: '1-1',
    description: 'Erro TCOP',
    requester_organization: 'Eco101',
    opened_at: '2026-10-02',
    mentions_totvs: true,
  },
);
assert.equal(merged.find((t) => t.ticket_id === '2-2').mentions_totvs, true, 'Motivo também conta como menção');
assert.deepEqual(
  mapTotvsImports(
    [
      { ticket_id: '2-2', description: 'Acesso MGI', reason: 'TOTVS', opened_at: '2026-10-03' },
      { ticket_id: '3-3', description: 'Impressora', opened_at: '2026-10-04' },
    ],
    { system: 'totvs' },
  ).map((t) => t.ticket_id),
  ['2-2'],
);
assert.equal(mentionsTotvs('Falha no totvs'), true);
assert.equal(mentionsTotvs('Protheus', 'TCOP'), true);
assert.equal(mentionsTotvs('totvsx sem palavra'), false);

// Consolidação da tela: campos estáveis vazios vêm da importação anterior; os de ciclo
// de vida (Status, Fechadoem) seguem a mais recente, mesmo vazios.
const consolidated = consolidateTotvsImports([
  {
    payload: {
      kind: 'detailed',
      scope: 'all',
      tickets: [
        { 'Caso n.º': '9-9', Status: 'Pendente', Fechadoem: '', Solicitante: '', Organizaçãodosolicitante: '' },
      ],
    },
  },
  {
    payload: {
      kind: 'detailed',
      scope: 'all',
      tickets: [
        {
          'Caso n.º': '9-9',
          Status: 'Fechado',
          Fechadoem: '2026-09-01T10:00:00',
          Solicitante: 'Fulano',
          Organizaçãodosolicitante: 'Ecovias',
        },
      ],
    },
  },
]);
assert.deepEqual(consolidated.payload.tickets, [
  { 'Caso n.º': '9-9', Status: 'Pendente', Fechadoem: '', Solicitante: 'Fulano', Organizaçãodosolicitante: 'Ecovias' },
]);

let calls = 0,
  databaseRows = rows;
const app = express();
app.use(
  '/production-auth',
  createDataRouter({
    execute: async () => {
      throw new Error('Consulta não deve ocorrer sem sessão.');
    },
  }),
);
app.use(
  '/api/data',
  createDataRouter({
    // Substitute authentication only in this local test; production uses requireUser.
    authenticate: (req, res, next) => (req.headers.cookie === 'test-session=valid' ? next() : res.sendStatus(401)),
    execute: async (sql) => {
      calls++;
      assert.match(sql, /public\.totvs_imports/);
      assert.match(sql, /jsonb_array_elements/);
      assert.match(sql, /importacao\.imported_at desc, importacao\.id desc/);
      assert.match(sql, /'Motivo' as reason/);
      return { rows: databaseRows };
    },
  }),
);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}/api/data/totvs-imports`;
  const authUrl = `http://127.0.0.1:${server.address().port}/production-auth/totvs-imports`;
  assert.equal((await fetch(authUrl)).status, 401);
  assert.equal((await fetch(authUrl, { headers: { 'x-api-key': 'not-a-session' } })).status, 401);
  assert.equal((await fetch(url)).status, 401);
  assert.equal(calls, 0);
  const response = await fetch(url, { headers: { Cookie: 'test-session=valid' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
  const totvsOnly = await fetch(`${url}?sistema=totvs`, { headers: { Cookie: 'test-session=valid' } });
  assert.equal(totvsOnly.status, 200);
  assert.deepEqual(await totvsOnly.json(), []);
  const invalidSystem = await fetch(`${url}?sistema=sap`, { headers: { Cookie: 'test-session=valid' } });
  assert.equal(invalidSystem.status, 400);
  databaseRows = [];
  assert.deepEqual(await (await fetch(url, { headers: { Cookie: 'test-session=valid' } })).json(), []);
  console.log(
    'OK: endpoint, autenticação substituída em teste, formato, datas, duplicatas, dados ausentes, junção sem apagar organização, filtro TOTVS e retorno vazio; banco simulado.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
