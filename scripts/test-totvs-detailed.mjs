import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTotvsXlsx } from '../server/services/totvs-xlsx.service.mjs';
import { createTotvsRouter } from '../server/routes/totvs.mjs';

const buffer = await readFile(process.argv[2]);
const all = parseTotvsXlsx(buffer, 'all');
const selected = parseTotvsXlsx(buffer);
assert.equal(all.sourceCount, 1716);
assert.equal(all.tickets.length, 1716);
assert.equal(selected.tickets.length, 860);
assert.equal(new Set(all.tickets.map(r => r['Caso n.º'])).size, 1716);
assert.equal(all.tickets.filter(r => r.Status === 'Fechado').length, 1607);
assert.equal(all.tickets.filter(r => r.Status === 'Resolvido').length, 37);
assert.equal(all.tickets.filter(r => ['Fechado', 'Resolvido'].includes(r.Status) && !r.Fechadoem).length, 12);
assert.throws(() => parseTotvsXlsx(buffer, 'invalid'), /Recorte/);
assert.throws(() => parseTotvsXlsx(Buffer.from('invalid')));

let calls = [], failDelete = false;
const app = express();
app.use('/api/totvs', createTotvsRouter({
  authenticate: (req, res, next) => {
    if (!req.headers['x-test-role']) return res.sendStatus(401);
    req.user = { role: req.headers['x-test-role'], id: 'test' }; next();
  },
  execute: async (sql, values) => {
    calls.push(sql);
    if (sql === 'DELETE FROM public.totvs_imports') {
      if (failDelete) throw Object.assign(new Error('permission'), { code: '42501' });
      return { rowCount: 2 };
    }
    return { rows: [{ id: '1', payload: JSON.parse(values[3]) }] };
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/api/totvs`;
try {
  const remove = (role, confirmation) => fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: JSON.stringify({ confirmation }) });
  assert.equal((await remove('', 'LIMPAR TOTVS')).status, 401);
  assert.equal((await remove('user', 'LIMPAR TOTVS')).status, 403);
  assert.equal((await remove('admin', 'wrong')).status, 400);
  assert.equal(calls.length, 0);
  const deleted = await remove('admin', 'LIMPAR TOTVS');
  assert.deepEqual(await deleted.json(), { deleted: 2 });
  assert.deepEqual(calls, ['DELETE FROM public.totvs_imports']);
  failDelete = true;
  assert.equal((await remove('admin', 'LIMPAR TOTVS')).status, 403);
  const upload = role => fetch(`${url}?scope=all`, { method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-test-role': role }, body: buffer });
  assert.equal((await upload('user')).status, 403);
  const imported = await upload('admin');
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).payload.tickets.length, 1716);
} finally { await new Promise(resolve => server.close(resolve)); }

const vite = await createServer({ configFile: false, envFile: false, plugins: [react()], resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
try {
  const { getTicketsSummary } = await vite.ssrLoadModule('/src/utils/ticketsKpis.ts');
  const summary = getTicketsSummary(all.tickets, { elapsed: true });
  assert.equal(summary.openedInPeriod, 1716);
  assert.equal(summary.closedInPeriod, 1632);
  assert.equal(summary.pendingTickets, 72);
  assert.equal(summary.slaApplicableTickets, 0);
  const september = getTicketsSummary(all.tickets, { startDate: '2026-09-01', endDate: '2026-09-30', elapsed: true });
  assert.equal(september.openedInPeriod, 85);
  const fixture = [{ ...all.tickets[0], Abertoem: '2026-08-31T23:00:00', Fechadoem: '2026-09-01T01:00:00', Atualizado: '', Status: 'Fechado' }];
  const boundary = getTicketsSummary(fixture, { startDate: '2026-09-01', endDate: '2026-09-30', elapsed: true });
  assert.equal(boundary.openedInPeriod, 0);
  assert.equal(boundary.closedInPeriod, 1);
  assert.equal(boundary.averageResolutionHours, 2);
  assert.equal(getTicketsSummary(fixture).averageResolutionHours, 0, 'PW keeps business hours');
  const { TicketsTab } = await vite.ssrLoadModule('/src/components/TicketsTab.tsx');
  const html = renderToStaticMarkup(React.createElement(TicketsTab, { rows: all.tickets, detailedTotvs: true }));
  for (const text of ['Mediana de solução', 'horas corridas', 'Evolução dos chamados', 'Organizações solicitantes', '>1716<', '>1632<', '>72<']) assert.ok(html.includes(text), text);
  const { TotvsPage } = await vite.ssrLoadModule('/src/pages/TotvsPage.tsx');
  assert.ok(renderToStaticMarkup(React.createElement(TotvsPage, { canManage: true })).includes('Limpar dados TOTVS'));
  assert.ok(!renderToStaticMarkup(React.createElement(TotvsPage, { canManage: false })).includes('Limpar dados TOTVS'));
  console.log('OK: XLSX real, recortes, totais, datas, horas corridas, preservação PW, renderização e autorização das rotas (banco simulado).');
} finally { await vite.close(); }
