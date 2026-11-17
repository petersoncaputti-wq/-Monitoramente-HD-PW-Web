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
  if (url.pathname === '/User/') return new Response(JSON.stringify({ detail: 'segredo-upstream /User/ interno' }), { status: 403 });
  return new Response('{}', { status: 404 });
};
const loginCalls = () => upstreamCalls.filter((call) => new URL(call.url).pathname === '/token/login/').length;

const silence = ['log', 'warn', 'error'].map(level => [level, console[level]]);
for (const [level] of silence) console[level] = () => {};

const { buildKartadoUrl, getToken } = await import('../server/services/kartado.service.mjs');
const { kartadoRouter, publicKartadoError } = await import('../server/routes/kartado.mjs');

// 0. Chamadas simultâneas com o cache vazio compartilham um único login.
const tokens = await Promise.all(Array.from({ length: 5 }, () => getToken('conta-servico-teste', 'senha-servico-teste')));
assert.equal(loginCalls(), 1, 'cinco chamadas simultâneas devem gerar um único login');
assert.ok(tokens.every((auth) => auth.token === SECRET_TOKEN));

// Mensagens públicas: nunca repassam detalhes do Kartado; 401/403 não viram 401.
assert.deepEqual(publicKartadoError({ httpStatus: 403, message: '[403] /User/: detalhe' }), { status: 502, message: 'A integração Kartado não tem permissão para esta consulta.' });
assert.equal(publicKartadoError({ httpStatus: 401 }).status, 502);
assert.equal(publicKartadoError({ httpStatus: 429 }).status, 429);
assert.equal(publicKartadoError({ httpStatus: 200, message: 'Resposta não-JSON' }).status, 502);
assert.equal(publicKartadoError(new TypeError('fetch failed')).status, 502);
assert.deepEqual(publicKartadoError({ httpStatus: 404, expose: true, message: 'Nenhuma concessão ativa disponível.' }), { status: 404, message: 'Nenhuma concessão ativa disponível.' });

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

  // 4. Falha do Kartado chega ao navegador sem detalhes internos.
  const COMPANY = '11111111-1111-1111-1111-111111111111';
  const searchFailure = await post('/search', { companyUuid: COMPANY, query: 'ana' });
  const searchText = await searchFailure.text();
  assert.equal(searchFailure.status, 502);
  assert.equal(searchText.includes('segredo-upstream'), false);
  assert.equal(searchText.includes('/User/'), false);

  // 5. /health valida o companyUuid e usa cache com limite.
  assert.equal((await post('/health', { companyUuid: 'qualquer-coisa' })).status, 400);
  const firstHealth = await post('/health', { companyUuid: COMPANY, companyName: 'Concessão Teste' });
  assert.equal(firstHealth.status, 200, await firstHealth.clone().text());
  assert.equal((await firstHealth.json()).cache.hit, false);
  upstreamCalls.length = 0;
  const secondHealth = await (await post('/health', { companyUuid: COMPANY })).json();
  assert.equal(secondHealth.cache.hit, true);
  assert.equal(upstreamCalls.length, 0, 'resposta em cache não consulta o Kartado');

  // 6. /dashboard grava e reaproveita o cache sem sobrescrever res.json.
  const firstDashboard = await post('/dashboard', { companyUuid: COMPANY, companyName: 'Concessão Teste', summaryOnly: true });
  assert.equal(firstDashboard.status, 200, await firstDashboard.clone().text());
  assert.equal((await firstDashboard.json()).success, true);
  upstreamCalls.length = 0;
  const cachedDashboard = await (await post('/dashboard', { companyUuid: COMPANY, summaryOnly: true })).json();
  assert.equal(cachedDashboard.cache.hit, true);
  assert.equal(upstreamCalls.length, 0);
} finally {
  server.close();
  for (const [level, original] of silence) console[level] = original;
}

console.log('Kartado router: rotas de depuração removidas, URL restrita à origem, sem vazamento de token ou detalhes, login único, caches de /health e /dashboard: OK.');
