import assert from 'node:assert/strict';
import { getKartadoTicketsKpis, formatKartadoDuration } from '../src/utils/kartadoTicketsKpis.ts';

const ticket = (overrides = {}) => ({ opened_at: '2026-01-01T12:00:00Z', closed_at: null, status: 'Novo', kartado_case_number: '', subject: 'Acesso', ...overrides });
const summary = getKartadoTicketsKpis([
  ticket({ kartado_case_number: ' K-1 ' }),
  ticket({ kartado_case_number: '   ' }),
  ticket({ status: 'Encerrado', closed_at: '2026-01-01T14:00:00Z', kartado_case_number: 'K-2' }),
  ticket({ status: 'Encerrado', closed_at: '2026-01-01T22:00:00Z' }),
  ticket({ status: 'Encerrado', closed_at: '2025-12-01T12:00:00Z' }),
  ticket({ status: 'Encerrado' }),
], new Date('2026-02-02T12:00:00Z'));
assert.equal(summary.total, 6);
assert.equal(summary.pending, 2);
assert.equal(summary.closed, 4);
assert.equal(summary.escalated, 2);
assert.equal(summary.escalatedPending, 1);
assert.equal(summary.validDurations, 2);
assert.equal(summary.average, 6);
assert.equal(summary.median, 6);
assert.equal(summary.aging[3].count, 2);
assert.equal(summary.resolution[0].count, 1);
assert.equal(summary.resolution[1].count, 1);
assert.equal(getKartadoTicketsKpis([]).median, null);
assert.equal(getKartadoTicketsKpis([]).escalatedPercent, 0);
assert.equal(formatKartadoDuration(null), '—');
assert.equal(formatKartadoDuration(2.5), '2h 30min');
assert.equal(getKartadoTicketsKpis([ticket({ status: 'Encerrado', closed_at: '2026-01-01T12:00:00Z' })]).median, 0);
const monthly = getKartadoTicketsKpis([ticket({ opened_at: '2025-01-01T12:00:00Z', status: 'Encerrado', closed_at: '2026-02-01T12:00:00Z' })]).monthly;
assert.equal(monthly.length, 12);
assert.equal(monthly.at(-1).closed, 1);
console.log('Indicadores Kartado: escalonamentos, pendências, durações válidas, mediana, faixas e evolução aprovados.');
