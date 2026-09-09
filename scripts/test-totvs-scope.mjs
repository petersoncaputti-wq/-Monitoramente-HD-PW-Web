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
  const { getTotvsCategories } = await vite.ssrLoadModule('/src/utils/totvsKpis.ts');
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
