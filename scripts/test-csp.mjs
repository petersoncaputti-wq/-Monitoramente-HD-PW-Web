import assert from 'node:assert/strict';
import express from 'express';
import helmet from 'helmet';
import { contentSecurityPolicy, createCspReportRouter } from '../server/csp.mjs';

// CSP: modo relatório por padrão; bloqueio só com CSP_ENFORCE=true.
const reportOnly = contentSecurityPolicy({});
assert.equal(reportOnly.reportOnly, true);
assert.equal(contentSecurityPolicy({ CSP_ENFORCE: 'true' }).reportOnly, false);

const reports = [];
const app = express();
app.use(helmet({ contentSecurityPolicy: reportOnly }));
app.use('/api/csp-report', createCspReportRouter({ log: (_label, summary) => reports.push(summary) }));
app.get('/', (_request, response) => response.send('ok'));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await fetch(base + '/');
  const header = page.headers.get('content-security-policy-report-only');
  assert.ok(header, 'cabeçalho Report-Only ausente');
  assert.equal(page.headers.get('content-security-policy'), null, 'não deve bloquear enquanto em modo relatório');
  for (const expected of [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'frame-src https://www.openstreetmap.org',
    'report-uri /api/csp-report',
  ]) {
    assert.ok(header.includes(expected), `diretiva ausente: ${expected}`);
  }
  assert.equal(header.includes("'unsafe-eval'"), false);

  // Relatórios: formato legado e Reporting API, sem query string no log.
  const legacy = await fetch(base + '/api/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': {
        'document-uri': 'https://painel.test/kartado?token=segredo',
        'blocked-uri': 'https://evil.test/x.js?a=1',
        'effective-directive': 'script-src',
      },
    }),
  });
  assert.equal(legacy.status, 204);
  const modern = await fetch(base + '/api/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/reports+json' },
    body: JSON.stringify([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://painel.test/',
          blockedURL: 'https://cdn.test/f.woff2',
          effectiveDirective: 'font-src',
        },
      },
    ]),
  });
  assert.equal(modern.status, 204);
  assert.deepEqual(
    reports.map((r) => [r.directive, r.blocked]),
    [
      ['script-src', 'https://evil.test/x.js'],
      ['font-src', 'https://cdn.test/f.woff2'],
    ],
  );
  assert.equal(JSON.stringify(reports).includes('segredo'), false, 'query string não vai para o log');
} finally {
  server.close();
}

console.log(
  'CSP: modo relatório por padrão (bloqueio só com CSP_ENFORCE=true), diretivas esperadas e coleta de violações sem query string: OK.',
);
