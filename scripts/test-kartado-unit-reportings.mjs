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
const { normalizeUnitReporting, loadUnitReportingPage, loadUnitReportings, ReportingPageError } = await compile('../src/services/kartadoUnitReportings.ts');
const { auditCounts, filterAuditItems, emptyAuditFilters } = await compile('../src/utils/kartadoAudit.ts');
const realFetch = globalThis.fetch;
try {
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: `id-${index}`, attributes: {
    number: index + 1, origin: index % 2 ? 'TRO' : 'NS', direction: index % 2 ? 'Sul' : 'Norte', occurrenceKind: 'Drenagem',
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
  assert.equal(received[0].natureza, 'Drenagem');
  assert.equal(filterAuditItems(received, { ...emptyAuditFilters, nature: 'Drenagem' }).length, 205);
  const realShape = { uuid: 'sample', direction: 'Sul', trecho: 'Norte', occurrenceKind: 'Drenagem e Obras de Arte Corrente (OAC)', occurrenceType: 'Limpeza / Desobstrução de Drenagem' };
  const mapped = normalizeUnitReporting(buildReportingMetrics([realShape], 1).items[0]);
  assert.equal(mapped.trecho, 'Sul');
  assert.equal(mapped.natureza, realShape.occurrenceKind);
  assert.equal(mapped.classe, realShape.occurrenceType);
  assert.equal(normalizeUnitReporting({ direction: ' NORTE ' }).trecho, 'Norte');
  assert.equal(normalizeUnitReporting({ direction: 'Leste', trecho: 'Norte' }).trecho, 'Não identificado');
  assert.equal(normalizeUnitReporting({ trecho: 'Norte' }).trecho, 'Não identificado');
  assert.equal(normalizeUnitReporting({ sentido: 'sul' }).trecho, 'Sul');
  assert.equal(normalizeUnitReporting({ natureza: 'Natureza explícita', occurrenceKind: 'Outra' }).natureza, 'Natureza explícita');

  globalThis.fetch = async () => Response.json({ unexpected: [] });
  await assert.rejects(listReportingPage('token', 'company'), error => error.httpStatus === 502);
  globalThis.fetch = async () => Response.json({ detail: 'denied' }, { status: 401 });
  await assert.rejects(listReportingPage('token', 'company'), error => error.httpStatus === 401);
  globalThis.fetch = async () => Response.json({ items: [], total: 205, pages: 0 });
  await assert.rejects(loadUnitReportingPage('company', 1, new AbortController().signal), /Paginação inválida/);
  globalThis.fetch = async () => Response.json({ items: [{ number: 1 }], total: 1, pages: 1 });
  await assert.rejects(loadUnitReportingPage('company', 1, new AbortController().signal), /sem identificação/);
  // Reproduz a página 312: uma única posição quebra todos os blocos que a contêm.
  let recoveryCalls = 0;
  globalThis.fetch = async url => {
    recoveryCalls++;
    const query = new URL(url).searchParams;
    const size = Number(query.get('page_size')), page = Number(query.get('page'));
    const start = (page - 1) * size;
    if (start <= 31116 && start + size > 31116) return Response.json({}, { status: 500 });
    return Response.json({ count: 34187, results: Array.from({ length: Math.min(size, 34187 - start) }, (_, i) => ({ uuid: `item-${start + i}` })) });
  };
  const recovered = await listReportingPage('token', 'company', 312);
  assert.equal(recovered.items.length, 99);
  assert.equal(new Set(recovered.items.map(item => item.uuid)).size, 99);
  assert.equal(recovered.totalPages, 342);
  assert.deepEqual(recovered.failedRecords, [31117]);
  assert.equal(recoveryCalls, 15);
  const partialPage = await loadUnitReportings('company', new AbortController().signal, () => {}, async () => ({ items: recovered.items.map(normalizeUnitReporting), total: 100, pages: 1, failedRecords: recovered.failedRecords }));
  assert.deepEqual(partialPage.failedPages, [1]);
  assert.match(partialPage.issue, /31117/);
  let unavailableCalls = 0;
  globalThis.fetch = async () => { unavailableCalls++; return Response.json({}, { status: 500 }); };
  await assert.rejects(listReportingPage('token', 'company', 312), error => error.httpStatus === 500);
  assert.equal(unavailableCalls, 20);
} finally { globalThis.fetch = realFetch; }
console.log('Apontamentos por unidade: paginação sem filtros, normalização, cards, filtros, resposta inválida e falha de autenticação OK.');

// Volume equivalente ao relato: 21.200 registros, 212 páginas, fora de ordem.
let active = 0, peak = 0, firstFinished = false;
const calls = [], progressEvents = [];
const makePage = (page, total = 21200) => ({ total, pages: Math.ceil(total / 100), items: Array.from({ length: Math.min(100, total - (page - 1) * 100) }, (_, i) => normalizeUnitReporting({ id: `row-${(page - 1) * 100 + i}`, status: 'Identificado' })) });
const complete = await loadUnitReportings('company', new AbortController().signal, progress => progressEvents.push(progress.processed), async (_, page) => {
  if (page > 1) assert.equal(firstFinished, true);
  calls.push(page); active++; peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, page % 3));
  active--; if (page === 1) firstFinished = true;
  return makePage(page);
});
assert.equal(peak, 3);
assert.equal(complete.items.length, 21200);
assert.equal(complete.issue, '');
assert.equal(new Set(calls).size, 212);
assert.equal(progressEvents.at(-1), 212);
assert.ok(progressEvents.every((value, index) => !index || value > progressEvents[index - 1]));

const attempts = new Map();
const partialResult = await loadUnitReportings('company', new AbortController().signal, () => {}, async (_, page) => {
  const attempt = (attempts.get(page) || 0) + 1; attempts.set(page, attempt);
  if (page === 2 || (page === 3 && attempt === 1)) throw new ReportingPageError('upstream failure', 500);
  return makePage(page, 600);
});
assert.equal(attempts.get(2), 3);
assert.equal(attempts.get(3), 2);
assert.equal(attempts.get(6), 1);
assert.deepEqual(partialResult.failedPages, [2]);
assert.equal(partialResult.items.length, 500);
assert.match(partialResult.issue, /HTTP 500/);

const mismatch = await loadUnitReportings('company', new AbortController().signal, () => {}, async (_, page) => {
  const data = makePage(page, 300);
  if (page === 2) { data.items[0] = makePage(1, 300).items[0]; data.total = 301; }
  return data;
});
assert.equal(mismatch.changed, true);
assert.equal(mismatch.duplicates, 1);
assert.equal(mismatch.items.length, 299);
assert.ok(mismatch.issue);

const authCalls = [];
await assert.rejects(loadUnitReportings('company', new AbortController().signal, () => {}, async (_, page) => {
  authCalls.push(page);
  if (page === 2) throw new ReportingPageError('session expired', 401);
  return makePage(page, 1000);
}), error => error.status === 401);
assert.deepEqual(authCalls, [1, 2, 3, 4]);
const cancellation = new AbortController();
let cancelCalls = 0;
await assert.rejects(loadUnitReportings('company', cancellation.signal, () => cancellation.abort(), async (_, page) => {
  cancelCalls++; return makePage(page);
}), error => error.name === 'AbortError');
assert.equal(cancelCalls, 1);
console.log('21.200 registros: primeira página isolada, concorrência máxima 3, progresso, retry 500, falha parcial, deduplicação, total variável, sessão expirada e cancelamento OK.');
