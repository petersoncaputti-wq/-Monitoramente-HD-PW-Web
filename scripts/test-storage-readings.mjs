import assert from 'node:assert/strict';
import express from 'express';
import { createStorageReadingsRouter } from '../server/routes/storage-readings.mjs';

const token = 'test-collector-token-at-least-32-characters';
const calls = [];
let configuredToken = token;
const app = express();
app.use(express.json());
app.use('/api/storage-readings', createStorageReadingsRouter({
  getToken: () => configuredToken,
  execute: async (...args) => { calls.push(args); },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/api/storage-readings`;
const reading = { Data: '2026-11-11', Hora: '14:30:00', Computador: 'pw-server', Unidade: 'E:', TotalGB: 100, UsadoGB: 70, LivreGB: 30, PercentualUsado: 70, PercentualLivre: 30 };
async function send(body, credential = token) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` }, body: JSON.stringify(body) });
}
try {
  assert.equal((await send(reading, 'wrong')).status, 401);
  configuredToken = undefined;
  assert.equal((await send(reading)).status, 503);
  configuredToken = token;
  for (const override of [{ Data: '2026-02-30' }, { Hora: '25:00:00' }, { TotalGB: '100' }, { LivreGB: -1 }, { PercentualUsado: 101 }, { UsadoGB: 20 }, { Unidade: 'E' }, { Computador: '' }]) {
    assert.equal((await send({ ...reading, ...override })).status, 400, JSON.stringify(override));
  }
  assert.equal(calls.length, 0);
  const response = await send(reading);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).observedAt, '2026-11-11T14:30:00-03:00');
  assert.equal(calls[0][1][3], 'PW-SERVER');
  assert.match(calls[0][0], /on conflict \(observed_at,computer,unit\) do update/);
  assert.equal((await send(reading)).status, 200);
  assert.deepEqual(calls[0][1], calls[1][1]);
  console.log('Storage readings: autenticação, validação, mapeamento e reenvio OK.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
