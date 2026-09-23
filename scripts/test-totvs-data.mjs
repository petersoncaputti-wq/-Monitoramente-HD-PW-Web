import assert from 'node:assert/strict';
import express from 'express';
import { createDataRouter } from '../server/routes/data.mjs';
import { normalizeTotvsOpenedAt, mapTotvsImports } from '../server/services/totvs-data.service.mjs';

assert.equal(normalizeTotvsOpenedAt('2026-03-14T23:59:59'), '2026-03-14');
assert.equal(normalizeTotvsOpenedAt('2024-02-29'), '2024-02-29');
for (const value of [null, '', 46000, '14/03/2026', '2026-02-29T12:00:00', '2026-13-01', 'invalid']) {
  assert.equal(normalizeTotvsOpenedAt(value), null);
}
const rows = [
  { ticket_id: '12345', description: 'Atualizado', requester_organization: 'Ecovias Rio Minas', opened_at: '2026-03-14T23:59:59' },
  { ticket_id: '12345', description: 'Versão anterior', requester_organization: 'Outra', opened_at: '2026-03-13T12:00:00' },
  { ticket_id: '67890', description: 'Sem data', requester_organization: null, opened_at: null },
  { ticket_id: null, description: 'Não é chamado' },
];
const expected = [
  { ticket_id: '12345', description: 'Atualizado', requester_organization: 'Ecovias Rio Minas', opened_at: '2026-03-14' },
  { ticket_id: '67890', description: 'Sem data', requester_organization: '', opened_at: null },
];
assert.deepEqual(mapTotvsImports(rows), expected);
assert.deepEqual(mapTotvsImports([]), []);

let calls = 0, databaseRows = rows;
const app = express();
app.use('/production-auth', createDataRouter({ execute: async () => { throw new Error('Consulta não deve ocorrer sem sessão.'); } }));
app.use('/api/data', createDataRouter({
  // Substitute authentication only in this local test; production uses requireUser.
  authenticate: (req, res, next) => req.headers.cookie === 'test-session=valid' ? next() : res.sendStatus(401),
  execute: async sql => {
    calls++;
    assert.match(sql, /public\.totvs_imports/);
    assert.match(sql, /jsonb_array_elements/);
    assert.match(sql, /importacao\.imported_at desc, importacao\.id desc/);
    return { rows: databaseRows };
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
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
  databaseRows = [];
  assert.deepEqual(await (await fetch(url, { headers: { Cookie: 'test-session=valid' } })).json(), []);
  console.log('OK: endpoint, autenticação substituída em teste, formato, datas, duplicatas, dados ausentes e retorno vazio; banco simulado.');
} finally { await new Promise(resolve => server.close(resolve)); }
