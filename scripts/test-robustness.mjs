import assert from 'node:assert/strict';
import express from 'express';
import { createBoundedCache } from '../server/services/bounded-cache.mjs';
import { HttpError, httpErrorHandler } from '../server/http-error.mjs';
import { dedupeStorageRows } from '../server/routes/imports.mjs';

const silence = ['log', 'warn', 'error'].map((level) => [level, console[level]]);
for (const [level] of silence) console[level] = () => {};

// 1. Cache: TTL, limite de entradas e descarte do menos usado.
let clock = 0;
const cache = createBoundedCache({ max: 3, ttlMs: 1000, now: () => clock });
cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
assert.equal(cache.get('a').value, 1); // "a" passa a ser o mais recente
cache.set('d', 4);
assert.equal(cache.size, 3);
assert.equal(cache.get('b'), undefined, 'o menos usado sai primeiro');
assert.equal(cache.get('a').value, 1);
for (let i = 0; i < 10_000; i++) cache.set(`chave-${i}`, i);
assert.equal(cache.size, 3, 'chaves vindas do cliente não fazem o cache crescer');
clock += 1001;
assert.equal(cache.get('chave-9999'), undefined, 'entrada expirada não é devolvida');
assert.equal(cache.set('x', 1).expiresAt, clock + 1000);

// 2. Importação de storage: leitura repetida no mesmo arquivo vira uma linha (a última).
const reading = (computer, used) => ({ observed_at: '2026-11-17T10:00:00.000Z', computer, unit: 'E:', used_gb: used });
const deduped = dedupeStorageRows([reading('SRV1', 10), reading('SRV2', 20), reading('SRV1', 11)]);
assert.equal(deduped.length, 2);
assert.equal(deduped.find((row) => row.computer === 'SRV1').used_gb, 11);

// 3. Erros HTTP: validação vira 4xx clara; erro desconhecido vira 500 genérico.
const app = express();
app.use(express.json({ limit: '1kb' }));
app.post('/http', () => { throw new HttpError(400, 'Data inválida: ontem'); });
app.post('/pg/:code', (req) => { throw Object.assign(new Error('detalhe interno do banco'), { code: req.params.code }); });
app.post('/boom', () => { throw new Error('segredo interno'); });
app.use(httpErrorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (path, body = '{}') => {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return { status: response.status, body: await response.json() };
};
try {
  assert.deepEqual(await post('/http'), { status: 400, body: { error: 'Data inválida: ontem' } });
  assert.equal((await post('/pg/22P02')).status, 400);
  assert.equal((await post('/pg/23505')).status, 409);
  assert.equal((await post('/pg/23503')).status, 409);
  assert.equal((await post('/http', '{json quebrado')).status, 400);
  assert.equal((await post('/http', JSON.stringify({ x: 'a'.repeat(2000) }))).status, 413);
  const unknown = await post('/boom');
  assert.equal(unknown.status, 500);
  assert.equal(JSON.stringify(unknown.body).includes('segredo'), false, 'detalhe interno não vaza');
  assert.equal(JSON.stringify((await post('/pg/23505')).body).includes('detalhe interno'), false);
} finally {
  server.close();
  for (const [level, original] of silence) console[level] = original;
}

console.log('Robustez: cache com limite/TTL/LRU, deduplicação da importação de storage e erros HTTP 400/409/413/500 sem vazamento: OK.');
