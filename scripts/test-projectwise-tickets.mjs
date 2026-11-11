import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const schema = await readFile(new URL('../azure/schema.sql', import.meta.url), 'utf8');
const table = schema.match(/create table if not exists tickets \([\s\S]*?\n\);/)[0];
await db.exec('create table app_users (id uuid primary key);');
await db.exec(table);
await db.exec("alter table tickets add column priority text; insert into tickets (case_number,opened_at,requester,priority) values ('LEGACY',now(),'Original','Alta');");
const migration = await readFile(new URL('../azure/remove-projectwise-ticket-priority.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration);
assert.equal((await db.query("select requester from tickets where case_number='LEGACY'")).rows[0].requester, 'Original');
assert.equal((await db.query("select column_name from information_schema.columns where table_name='tickets' and column_name='priority'")).rows.length, 0);
// Execute the real route handlers against PostgreSQL, with authentication supplied by the test.
const source = (await readFile(new URL('../server/routes/tickets.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export default router;', 'return router;');
const authenticate = (req, res, next) => { req.user = { id: null }; next(); };
const router = new Function('Router', 'requireAdmin', 'requireUser', 'query', source)(express.Router, authenticate, authenticate, (sql, args) => db.query(sql, args));
const app = express(); app.use(express.json()); app.use('/tickets', router);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/tickets`;
const send = (method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  const body = { caseNumber: 'PW-001', status: 'Novo', openedAt: '2026-11-11T12:00:00Z', requester: 'Pessoa', assignedGroup: 'Suporte', requestedFor: 'Equipe', priority: 'Alta' };
  const created = await send('POST', body);
  assert.equal(created.status, 201, await created.clone().text());
  const row = await created.json();
  assert.equal(row.requester, 'Pessoa');
  assert.equal(row.assigned_group, 'Suporte');
  assert.equal(row.requested_for, 'Equipe');
  assert.ok(!Object.hasOwn(row, 'priority'));
  const updated = await send('PATCH', { ...body, id: row.id, requester: 'Outra pessoa', status: 'Fechado', closedAt: '2026-11-11T13:00:00Z' });
  assert.equal(updated.status, 200, await updated.clone().text());
  const final = await updated.json();
  assert.equal(final.requester, 'Outra pessoa');
  assert.equal(final.status, 'Fechado');
  assert.equal(final.requested_for, 'Equipe');
  assert.ok(final.closed_at);
  assert.equal((await send('DELETE', { id: row.id })).status, 200);
  console.log('ProjectWise: migration preserves tickets, is repeatable, and CRUD works without priority.');
} finally { await new Promise(resolve => server.close(resolve)); await db.close(); }
