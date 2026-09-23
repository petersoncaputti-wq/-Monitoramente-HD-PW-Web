import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTotvsZip } from '../server/services/totvs-import.service.mjs';

const payload = parseTotvsZip(await readFile(process.argv[2]), '2026-08');
const vite = await createServer({ configFile: false, envFile: false, plugins: [react()], resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
try {
  const { getTotvsCategories, getTotvsMonthlySeries } = await vite.ssrLoadModule('/src/utils/totvsKpis.ts');
  const { TotvsMonthlyEvolution } = await vite.ssrLoadModule('/src/components/TotvsMonthlyEvolution.tsx');
  const months = [
    { report_period: '2026-06', imported_at: '2026-06-15', categories: [{ label: 'TOTVS', count: 20 }] },
    { report_period: '2026-06', imported_at: '2026-06-22', categories: [{ label: 'TOTVS', count: 30 }, { label: 'MGI', count: 999 }] },
    { report_period: '2026-08', imported_at: '2026-09-08', categories: payload.lists.categories },
    { report_period: '2026-09', imported_at: '2026-09-09', categories: [{ label: 'TOTVS', count: 0 }] },
  ];
  const evolution = getTotvsMonthlySeries(months, '2026-09');
  assert.deepEqual(evolution.map(row => row.opened), [30, undefined, 97, 0]);
  assert.equal(evolution[1].hasImport, false);
  assert.equal(getTotvsMonthlySeries(months, '2026-06').length, 1);
  assert.deepEqual(getTotvsMonthlySeries([], '2026-09'), []);
  const chart = renderToStaticMarkup(React.createElement(TotvsMonthlyEvolution, { snapshots: months, endPeriod: '2026-09' }));
  assert.ok(chart.includes('Evolução mensal dos chamados TOTVS'));
  assert.ok(chart.includes('Sem importação'));
  assert.ok(chart.includes('>30<') && chart.includes('>97<') && chart.includes('>0<'));
  assert.ok(!chart.includes('999'));
  let clickedPeriod;
  const interactive = TotvsMonthlyEvolution({ snapshots: months, endPeriod: '2026-09', selectedPeriod: '2026-08', onSelectPeriod: period => { clickedPeriod = period; } });
  function descendants(element) {
    if (!element || typeof element !== 'object') return [];
    return [element, ...React.Children.toArray(element.props?.children).flatMap(descendants)];
  }
  const buttons = descendants(interactive).filter(element => element.type === 'button');
  const june = buttons.find(button => button.props['aria-label'].includes('jun.'));
  assert.ok(june && !june.props.disabled);
  june.props.onClick();
  assert.equal(clickedPeriod, '2026-06');
  assert.equal(buttons.find(button => button.props['aria-label'].includes('jul.')).props.disabled, true);
  assert.equal(buttons.find(button => button.props['aria-label'].includes('ago.')).props['aria-pressed'], true);
  const disabledChart = TotvsMonthlyEvolution({ snapshots: months, endPeriod: '2026-09', disabled: true, onSelectPeriod: () => {} });
  assert.ok(descendants(disabledChart).filter(element => element.type === 'button').every(button => button.props.disabled));
  const { TotvsIndicators } = await vite.ssrLoadModule('/src/pages/TotvsPage.tsx');
  const selected = getTotvsCategories(payload.lists.categories);
  assert.equal(selected.identifiedOpened, 97);
  assert.deepEqual(selected.items.map(row => row.count), [76, 12, 9]);
  assert.equal(getTotvsCategories([{ label: 'TI - MGP', count: 99 }, { label: 'NOTOTVS', count: 100 }]).identifiedOpened, undefined);
  assert.equal(getTotvsCategories([{ label: 'totvs - Acesso', count: 0 }]).identifiedOpened, 0);
  assert.equal(getTotvsCategories().identifiedOpened, undefined);
  const html = renderToStaticMarkup(React.createElement(TotvsIndicators, { data: payload }));
  assert.ok(html.includes('>97<'));
  assert.ok(html.includes('TOTVs TCOP'));
  assert.ok(html.includes('Volume por motivo'));
  assert.ok(html.includes('Distribuição por motivo'));
  assert.ok(html.includes('78,35%'));
  assert.ok(html.includes('12,37%'));
  assert.ok(html.includes('9,28%'));
  assert.ok(html.includes('conic-gradient'));
  for (const mixed of ['MGI', 'MGP', 'CSP', 'ECS', '>195<', '>201<', '>66<', '>54<', '>100%<', '98,51', '24,85']) assert.ok(!html.includes(mixed), `Dados mistos renderizados: ${mixed}`);
  const emptyHtml = renderToStaticMarkup(React.createElement(TotvsIndicators, { data: { ...payload, lists: {} } }));
  assert.ok(emptyHtml.includes('Nenhuma categoria identificada'));
  assert.ok(!emptyHtml.includes('>0<'));
  console.log('Recorte TOTVS: 97 identificados, 3 categorias, dados mistos ocultos, ausência distinta de zero e conteúdo renderizado verificados.');
} finally { await vite.close(); }
