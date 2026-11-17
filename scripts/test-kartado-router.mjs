import assert from 'node:assert/strict';
import express from 'express';

// Ambiente isolado: a API Kartado é simulada e nenhuma credencial real é usada.
const KARTADO_BASE = 'https://kartado.test';
const SECRET_TOKEN = 'jwt-secreto-de-teste-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.KARTADO_API_URL = KARTADO_BASE;
process.env.KARTADO_USERNAME = 'conta-servico-teste';
process.env.KARTADO_PASSWORD = 'senha-servico-teste';

const upstreamCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  upstreamCalls.push({ url: url.href, authorization: init.headers?.Authorization ?? init.headers?.authorization });
  if (url.origin !== KARTADO_BASE) throw new Error(`Requisição para origem não permitida: ${url.origin}`);
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/token/login/') return json({ data: { token: SECRET_TOKEN, user: { username: 'conta-servico-teste' } } });
  if (url.pathname === '/Company/') return json({ data: [{ id: 'c1', attributes: { uuid: '11111111-1111-1111-1111-111111111111', name: 'Concessão Teste', active: true } }], meta: { pagination: { count: 1, pages: 1 } } });
  return new Response('{}', { status: 404 });
};

const silence = ['log', 'warn'].map(level => [level, console[level]]);
for (const [level] of silence) console[level] = () => {};

const { buildKartadoUrl } = await import('../server/services/kartado.service.mjs');
const { kartadoRouter } = await import('../server/routes/kartado.mjs');

// 1. Montagem de URL: o token só pode seguir para a origem configurada.
assert.equal(buildKartadoUrl(KARTADO_BASE, '/Reporting/', '?company=x&page=1'), `${KARTADO_BASE}/Reporting/?company=x&page=1`);
assert.equal(buildKartadoUrl('https://kartado.test/api', '/Company/'), 'https://kartado.test/api/Company/');
for (const hostile of ['.evil.example/x', '@evil.example/x', 'evil', '', '/\\evil.example', '/a\nb', null, undefined, 42]) {
  assert.throws(() => buildKartadoUrl(KARTADO_BASE, hostile), error => error.httpStatus === 400, `caminho aceito indevidamente: ${JSON.stringify(hostile)}`);
}

const app = express();
app.use(express.json());
app.use('/api/v1/kartado', kartadoRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/v1/kartado`;
const post = (path, body = {}) => realFetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

try {
  // 2. Rotas de depuração removidas não existem mais e não chamam o Kartado.
  const removed = [
    ['POST', '/inspect', { path: '.evil.example/x' }],
    ['POST', '/auth'],
    ['POST', '/diagnose'],
    ['POST', '/validate-programacoes', { companyUuid: 'x' }],
    ['POST', '/reporting-photos', { reportingUuid: 'x' }],
    ['GET', '/status'],
    ['GET', '/sync-stream?companyUuid=x'],
  ];
  for (const [method, path, body] of removed) {
    upstreamCalls.length = 0;
    const response = method === 'GET' ? await realFetch(`${base}${path}`) : await post(path, body);
    const text = await response.text();
    assert.equal(response.status, 404, `${method} ${path} deveria retornar 404`);
    assert.equal(upstreamCalls.length, 0, `${method} ${path} não deveria chamar o Kartado`);
    assert.equal(text.includes(SECRET_TOKEN.slice(0, 20)), false);
  }

  // 3. Rota usada pelo painel continua funcionando, sem vazar o token.
  upstreamCalls.length = 0;
  const response = await post('/companies');
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const payload = JSON.parse(text);
  assert.equal(payload.success, true);
  assert.equal(payload.companies[0].name, 'Concessão Teste');
  assert.equal(text.includes(SECRET_TOKEN.slice(0, 20)), false, 'resposta não pode conter o token');
  assert.ok(upstreamCalls.length > 0);
  for (const call of upstreamCalls) assert.equal(new URL(call.url).origin, KARTADO_BASE);
} finally {
  server.close();
  for (const [level, original] of silence) console[level] = original;
}

console.log('Kartado router: rotas de depuração removidas, URL restrita à origem configurada e /companies sem vazamento de token: OK.');
