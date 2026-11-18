// Séries temporais da Visão geral do Kartado: executa o módulo TypeScript real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/kartadoTrends.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { monthlyTrend, dailyTrend, weeklyTrend, quarterlyTrend, yearlyTrend, executionTrend } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);

const item = (dataCriacao, dataExecucao = null) => ({
  uuid: `${dataCriacao}-${dataExecucao}`,
  dataCriacao,
  dataExecucao,
});
const today = '2026-11-18'; // quarta-feira
const items = [
  item('2026-11-18', '2026-11-18'),
  item('2026-11-18'),
  item('2026-11-16', '2026-11-17'), // segunda da semana atual
  item('2026-11-15'), // domingo: semana anterior
  item('2026-10-20', '2026-11-02'),
  item('2026-10-19'), // fora da janela de 30 dias
  item('2026-08-31', '2026-09-01'),
  item('2025-12-31'),
  item('2024-02-29'),
  item(null),
  item('2026-02-30'), // data inexistente
  item('18/11/2026'),
];

const monthly = monthlyTrend(items);
assert.equal(monthly.undated, 3);
assert.equal(monthly.points[0].key, '2024-02');
assert.equal(monthly.points.at(-1).key, '2026-11');
assert.equal(monthly.points.length, 34);
assert.equal(monthly.points.find((p) => p.key === '2026-01').value, 0);
assert.equal(monthly.points.at(-1).value, 4);
assert.equal(monthlyTrend([]).points.length, 0);

const daily = dailyTrend(items, today);
assert.equal(daily.length, 30);
assert.equal(daily[0].key, '2026-10-20');
assert.equal(daily.at(-1).key, today);
assert.equal(daily.at(-1).value, 2);
assert.equal(daily[0].value, 1);
assert.equal(
  daily.reduce((sum, p) => sum + p.value, 0),
  5,
);
assert.match(daily.at(-1).full, /^qua 18\/11\/2026$/);

const weekly = weeklyTrend(items, today);
assert.equal(weekly.length, 12);
assert.equal(weekly.at(-1).key, '2026-11-16');
assert.equal(weekly.at(-1).value, 3);
assert.equal(weekly.at(-2).key, '2026-11-09');
assert.equal(weekly.at(-2).value, 1);
assert.ok(weekly.at(-1).label.endsWith('*'));

const quarterly = quarterlyTrend(items, today);
assert.equal(quarterly.length, 8);
assert.equal(quarterly.at(-1).key, '2026-T4');
assert.equal(quarterly.at(-1).value, 6);
assert.equal(quarterly.at(-2).value, 1); // 2026-08-31
assert.equal(quarterly.at(-5).key, '2025-T4');
assert.equal(quarterly.at(-5).value, 1);
assert.equal(quarterly[0].key, '2025-T1');

const yearly = yearlyTrend(items, today);
assert.deepEqual(
  yearly.map((p) => [p.key, p.value]),
  [
    ['2024', 1],
    ['2025', 1],
    ['2026', 7],
  ],
);
assert.equal(yearly.at(-1).full, '2026 (até 18/11/2026)');
assert.deepEqual(
  yearlyTrend([], today).map((p) => p.key),
  ['2026'],
);

const execution = executionTrend(items, today);
assert.equal(execution.length, 6);
assert.equal(execution[0].key, '2026-06');
assert.deepEqual(
  execution.map((p) => [p.key, p.value, p.value2]),
  [
    ['2026-06', 0, 0],
    ['2026-07', 0, 0],
    ['2026-08', 1, 0],
    ['2026-09', 0, 1],
    ['2026-10', 2, 0],
    ['2026-11', 4, 3],
  ],
);

console.log('kartado trends: ok');
