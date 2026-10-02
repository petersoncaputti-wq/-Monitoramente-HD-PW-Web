import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { listReportingPage } from '../server/services/kartado.service.mjs';
import { buildReportingMetrics } from '../server/services/kartado-analytics.service.mjs';
const compile = async path => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};
const { normalizeUnitReporting, loadUnitReportingPage } = await compile('../src/services/kartadoUnitReportings.ts');
const { auditCounts, filterAuditItems, emptyAuditFilters } = await compile('../src/utils/kartadoAudit.ts');
const realFetch = globalThis.fetch;
try {
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: `id-${index}`, attributes: {
    number: index + 1, origin: index % 2 ? 'TRO' : 'NS', trecho: index % 2 ? 'Sul' : 'Norte',
    status: index % 2 ? 'Executado' : 'Identificado', createdAt: '2026-09-01T12:00:00Z', dueAt: '2026-09-02',
  } }));
  const requests = [];
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams;
    assert.equal(query.has('origin'), false);
    assert.equal(query.has('found_at_after'), false);
    const page = Number(query.get('page')); requests.push(page);
    return Response.json({ results: rows.slice((page - 1) * 100, page * 100), count: rows.length });
  };
  const received = [];
  for (let page = 1; page <= 3; page++) {
    const data = await listReportingPage('test-token', 'test-company', page);
    assert.equal(data.totalPages, 3);
    received.push(...buildReportingMetrics(data.items, data.totalCount).items.map(normalizeUnitReporting));
  }
  assert.deepEqual(requests, [1, 2, 3]);
  assert.equal(received.length, 205);
  assert.equal(new Set(received.map(row => row.origem)).size, 2);
  assert.equal(filterAuditItems(received, { ...emptyAuditFilters, section: 'Sul' }).length, 102);
  assert.equal(filterAuditItems(received, emptyAuditFilters).length, 205);
  assert.deepEqual(auditCounts(received, '2026-10-02'), { total: 205, pending: 103, completed: 102, overdue: 103, other: 0 });
  assert.equal(normalizeUnitReporting({ id: 'missing' }).trecho, 'Não identificado');
  globalThis.fetch = async () => Response.json({ unexpected: [] });
  await assert.rejects(listReportingPage('token', 'company'), error => error.httpStatus === 502);
  globalThis.fetch = async () => Response.json({ detail: 'denied' }, { status: 401 });
  await assert.rejects(listReportingPage('token', 'company'), error => error.httpStatus === 401);
  globalThis.fetch = async () => Response.json({ items: [], total: 205, pages: 0 });
  await assert.rejects(loadUnitReportingPage('company', 1, new AbortController().signal), /Paginação inválida/);
  globalThis.fetch = async () => Response.json({ items: [{ number: 1 }], total: 1, pages: 1 });
  await assert.rejects(loadUnitReportingPage('company', 1, new AbortController().signal), /sem identificação/);
} finally { globalThis.fetch = realFetch; }
console.log('Apontamentos por unidade: paginação sem filtros, normalização, cards, filtros, resposta inválida e falha de autenticação OK.');
