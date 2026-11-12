import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import XLSX from 'xlsx';
import { zipSync, strToU8 } from 'fflate';
import { createTotvsRouter } from '../server/routes/totvs.mjs';

// Pass an isolated installation of PGlite to test real PostgreSQL semantics
// without requiring credentials or touching the application database.
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite');
const db = new PGlite();
const schema = await readFile(new URL('../azure/totvs-schema.sql', import.meta.url), 'utf8');
await db.exec('CREATE TABLE app_users (id uuid PRIMARY KEY)');
// Reproduce the old schema and a previously saved detailed import.
await db.exec(schema);
await db.exec('DROP INDEX totvs_imports_zip_period_uidx; CREATE UNIQUE INDEX totvs_imports_report_period_uidx ON totvs_imports (report_period)');
const legacy = { kind: 'detailed', scope: 'mentions', reportPeriod: '2026-09', sourceUpdatedAt: '2026-09-01', lists: { categories: [] }, tickets: [{ 'Caso n.º': '1-1', Status: 'Pendente', Resumo: 'Legado' }] };
await db.query('INSERT INTO totvs_imports (report_period, source_updated_at, payload) VALUES ($1, $2, $3)', ['2026-09', '2026-09-01', legacy]);
await db.exec(schema);
await db.exec(schema); // Safe to rerun, and historical rows remain.
assert.equal((await db.query('SELECT count(*)::int AS count FROM totvs_imports')).rows[0].count, 1);

const app = express();
app.use('/api/totvs', createTotvsRouter({
  execute: (sql, values) => db.query(sql, values),
  authenticate: (req, res, next) => {
    if (!req.headers['x-test-role']) return res.sendStatus(401);
    req.user = { id: null, role: req.headers['x-test-role'] }; next();
  },
}));
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/api/totvs`;
const headers = { 'x-test-role': 'admin', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function xlsx(tickets) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ID do ticket', 'Data de criacao', 'Data de resolucao', 'Status', 'Descricao', 'Atribuir ao grupo'],
    ...tickets.map(([id, status = 'Pending', opened = 46280, description = 'TOTVS teste']) => [id, opened, '', status, description, 'Suporte']),
  ]), 'Chamados');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
async function upload(tickets, scope = 'mentions') {
  const response = await fetch(`${url}?scope=${scope}`, { method: 'POST', headers, body: xlsx(tickets) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
async function accumulated() {
  const response = await fetch(`${url}/consolidated`, { headers });
  assert.equal(response.status, 200);
  return (await response.json()).payload;
}
try {
  assert.equal((await fetch(`${url}/consolidated`)).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'x-test-role': 'user' }, body: xlsx([['2-2']]) })).status, 403);
  assert.equal((await accumulated()).tickets.length, 1);
  await db.exec('DROP INDEX totvs_imports_zip_period_uidx; CREATE UNIQUE INDEX totvs_imports_report_period_uidx ON totvs_imports (report_period)');
  const unmigrated = await fetch(url, { method: 'POST', headers, body: xlsx([['2-2']]) });
  assert.equal(unmigrated.status, 503, 'An unmigrated database must never replace a previous XLSX');
  assert.equal((await accumulated()).tickets[0].Resumo, 'Legado');
  await db.exec(schema);
  const first = await upload([['2-2']]);
  assert.equal(first.payload.reportPeriod, '2026-09');
  await upload([['3-3'], ['2-2', 'Closed']]);
  let payload = await accumulated();
  assert.equal(payload.tickets.length, 3, 'Same-month upload preserves legacy and previous calls');
  assert.equal(payload.tickets.find(row => row['Caso n.º'] === '2-2').Status, 'Fechado');
  const snapshot = await (await fetch(`${url}/${first.id}`, { headers })).json();
  assert.equal(snapshot.payload.tickets[0].Status, 'Pendente', 'Historical imports remain intact');
  await upload([['3-3'], ['2-2', 'Closed']]);
  assert.equal((await accumulated()).tickets.length, 3, 'Reimport does not duplicate calls');
  await upload([['4-4', 'Pending', 46310, 'Outro sistema']], 'all');
  await upload([['5-5', 'Pending', 46310]]);
  payload = await accumulated();
  assert.equal(payload.tickets.length, 5, 'Different months and narrower scope preserve calls');
  assert.equal(payload.scope, 'all', 'Mixed scopes remain labelled as including other systems');
  await Promise.all([upload([['6-6']]), upload([['7-7']])]);
  assert.equal((await accumulated()).tickets.length, 7, 'Concurrent imports do not lose calls');
  const invalid = await fetch(url, { method: 'POST', headers, body: Buffer.from('invalid') });
  assert.equal(invalid.status, 400);
  assert.equal((await accumulated()).tickets.length, 7);

  // ZIP is an aggregate monthly snapshot, and must never replace XLSX rows.
  const zip = count => zipSync(Object.fromEntries(Object.entries({
    'Serviço_Selecionado_-_Detalhado_Item_de_Catálogo_.csv': ',,\nSep 2026,10,Abertos\n',
    'Serviço_Selecionado_Abertos_-_Top_10_CCTI.csv': `,\n${count},TI - TOTVS TCOP\n`,
    'Status_cargas.csv': ',\n29/09/2026 10:00:00\n',
  }).map(([name, content]) => [name, strToU8(content)])));
  for (const count of [10, 12]) {
    const response = await fetch(`${url}?period=2026-09`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip(count) });
    assert.equal(response.status, 200, await response.text());
  }
  assert.equal((await accumulated()).tickets.length, 7);
  const zipRows = await db.query("SELECT payload FROM totvs_imports WHERE payload->>'kind' IS DISTINCT FROM 'detailed'");
  assert.equal(zipRows.rows.length, 1);
  assert.equal(zipRows.rows[0].payload.lists.categories[0].count, 12);
  const cleared = await fetch(url, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'LIMPAR TOTVS' }) });
  assert.equal(cleared.status, 200);
  assert.equal(await accumulated(), null);
  console.log('OK: PostgreSQL migration, preservation, same/different months, deduplication, updates, scopes, concurrency, ZIP isolation, authentication and clearing.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
