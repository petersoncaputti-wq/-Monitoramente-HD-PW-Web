// Explicit, loopback-only development preview. Never mounted by the production server.
import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseTotvsZip, selectTotvsPayload } from '../server/services/totvs-import.service.mjs';

const [zipPath, period, dataDirectory = 'tmp/totvs-preview'] = process.argv.slice(2);
if (!zipPath || !period) throw new Error('Uso: node scripts/preview-totvs.mjs <ZIP> <YYYY-MM> [pasta de dados]');
const directory = resolve(dataDirectory);
await mkdir(directory, { recursive: true });
const filePath = resolve(directory, 'imports.json');
let imports;
try { imports = JSON.parse(await readFile(filePath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const payload = selectTotvsPayload(parseTotvsZip(await readFile(resolve(zipPath)), period));
  imports = [{ id: '1', payload, imported_at: new Date().toISOString() }];
  await writeFile(filePath, JSON.stringify(imports));
}
process.env.VITE_TOTVS_LOCAL_PREVIEW = 'true';
const app = express();
app.get('/api/totvs', (_request, response) => response.json([...imports].sort((a,b) => b.payload.reportPeriod.localeCompare(a.payload.reportPeriod) || b.imported_at.localeCompare(a.imported_at)).map(row => ({ id: row.id, report_period: row.payload.reportPeriod, source_updated_at: row.payload.sourceUpdatedAt, imported_at: row.imported_at, categories: row.payload.lists.categories }))));
app.get('/api/totvs/:id', (request, response) => {
  const row = imports.find(row => row.id === request.params.id);
  if (!row) return response.status(404).json({ error: 'Importação não encontrada.' });
  response.json(row);
});
let queue = Promise.resolve();
app.post('/api/totvs', express.raw({ type: 'application/zip', limit: '10mb' }), async (request, response, next) => {
  // Reject cross-origin browser writes to the local test data.
  if (request.headers.origin && request.headers.origin !== 'http://127.0.0.1:5175') return response.status(403).json({ error: 'Origem não permitida.' });
  let payload;
  try { if (!Buffer.isBuffer(request.body)) throw new Error('Envie um ZIP.'); payload = selectTotvsPayload(parseTotvsZip(request.body, String(request.query.period || ''))); }
  catch (error) { return response.status(400).json({ error: error.message }); }
  const operation = queue.then(async () => {
    const existing = imports.find(row => row.payload.reportPeriod === payload.reportPeriod);
    const row = { id: existing?.id ?? String(Math.max(...imports.map(row => Number(row.id)), 0) + 1), payload, imported_at: new Date().toISOString() };
    const updated = [...imports.filter(item => item.payload.reportPeriod !== payload.reportPeriod), row];
    await writeFile(`${filePath}.tmp`, JSON.stringify(updated));
    await rename(`${filePath}.tmp`, filePath);
    imports = updated;
    response.json(row);
  });
  queue = operation.catch(() => {});
  try { await operation; } catch(error) { next(error); }
});
app.use('/api', (_request, response) => response.status(404).json({ error: 'Serviço não disponível nesta prévia local.' }));
const vite = await createServer({ configFile: false, envFile: false, define: { 'import.meta.env.VITE_TOTVS_LOCAL_PREVIEW': JSON.stringify('true') }, plugins: [react()], resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
app.use(vite.middlewares);
app.use((error, _request, response, _next) => response.status(500).json({ error: error.message }));
const server = app.listen(5175, '127.0.0.1', () => console.log('Prévia TOTVs: http://127.0.0.1:5175/totvs/chamados'));
async function stop() { server.close(); await vite.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
