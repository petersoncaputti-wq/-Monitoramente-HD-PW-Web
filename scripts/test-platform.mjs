import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { contentSecurityPolicy, createCspReportRouter } from '../server/csp.mjs';
import { useBodyParsers } from '../server/body-parsers.mjs';
import { httpErrorHandler } from '../server/http-error.mjs';

// 1. xlsx: versão sem as CVEs de prototype pollution e ReDoS (>= 0.20.2).
const xlsxVersion = JSON.parse(readFileSync(new URL('../node_modules/xlsx/package.json', import.meta.url), 'utf8')).version;
const [major, minor, patch] = xlsxVersion.split('.').map(Number);
assert.ok(major > 0 || minor > 20 || (minor === 20 && patch >= 2), `xlsx ${xlsxVersion} tem vulnerabilidades conhecidas; use >= 0.20.2`);

// 2. .env.local: carregado em desenvolvimento, sem sobrescrever o ambiente; ignorado em produção.
const loadEnv = fileURLToPath(new URL('../server/load-env.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'env-test-'));
try {
  writeFileSync(join(dir, '.env.local'), 'TESTE_ARQUIVO="do arquivo"\nTESTE_AMBIENTE=do-arquivo\n');
  const read = (nodeEnv) => execFileSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(pathToFileURL(loadEnv).href)}); console.log(JSON.stringify([process.env.TESTE_ARQUIVO ?? null, process.env.TESTE_AMBIENTE]))`],
  { cwd: dir, env: { ...process.env, NODE_ENV: nodeEnv, TESTE_AMBIENTE: 'do-ambiente' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(read('development')), ['do arquivo', 'do-ambiente']);
  assert.deepEqual(JSON.parse(read('production')), [null, 'do-ambiente']);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 3. CSP: modo relatório por padrão; bloqueio só com CSP_ENFORCE=true.
const reportOnly = contentSecurityPolicy({});
assert.equal(reportOnly.reportOnly, true);
assert.equal(contentSecurityPolicy({ CSP_ENFORCE: 'true' }).reportOnly, false);

const reports = [];
const app = express();
app.use(helmet({ contentSecurityPolicy: reportOnly }));
app.use('/api/csp-report', createCspReportRouter({ log: (_label, summary) => reports.push(summary) }));
useBodyParsers(app);
app.post(['/api/storage-import', '/api/tickets'], (request, response) => response.json({ bytes: JSON.stringify(request.body).length }));
app.get('/', (_request, response) => response.send('ok'));
app.use(httpErrorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await fetch(base + '/');
  const header = page.headers.get('content-security-policy-report-only');
  assert.ok(header, 'cabeçalho Report-Only ausente');
  assert.equal(page.headers.get('content-security-policy'), null, 'não deve bloquear enquanto em modo relatório');
  for (const expected of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", 'frame-src https://www.openstreetmap.org', 'report-uri /api/csp-report']) {
    assert.ok(header.includes(expected), `diretiva ausente: ${expected}`);
  }
  assert.equal(header.includes("'unsafe-eval'"), false);

  // Relatórios: formato legado e Reporting API, sem query string no log.
  const legacy = await fetch(base + '/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://painel.test/kartado?token=segredo', 'blocked-uri': 'https://evil.test/x.js?a=1', 'effective-directive': 'script-src' } }) });
  assert.equal(legacy.status, 204);
  const modern = await fetch(base + '/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/reports+json' },
    body: JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'https://painel.test/', blockedURL: 'https://cdn.test/f.woff2', effectiveDirective: 'font-src' } }]) });
  assert.equal(modern.status, 204);
  assert.deepEqual(reports.map((r) => [r.directive, r.blocked]), [['script-src', 'https://evil.test/x.js'], ['font-src', 'https://cdn.test/f.woff2']]);
  assert.equal(JSON.stringify(reports).includes('segredo'), false, 'query string não vai para o log');

  // 4. Limite de corpo: 25 MB só nas importações; 1 MB no restante.
  const payload = JSON.stringify({ content: 'x'.repeat(2 * 1024 * 1024) });
  const send = (path) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  assert.equal((await send('/api/storage-import')).status, 200);
  assert.equal((await send('/api/tickets')).status, 413);
} finally {
  server.close();
}

console.log(`Plataforma: xlsx ${xlsxVersion}, .env.local só em desenvolvimento sem sobrescrever o ambiente, CSP em modo relatório com coleta de violações e limite de corpo por rota: OK.`);
