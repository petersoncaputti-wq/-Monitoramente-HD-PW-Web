import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './api/_router.mjs';
import { requireAdmin } from './api/_auth.mjs';

const distRoot = fileURLToPath(new URL('./dist', import.meta.url));
const projectRoot = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.env.PORT || 8080);
const maxBodyBytes = 50 * 1024 * 1024;
const syncScripts = {
  '/api/sync-portal-users': 'scripts/sync-portal-users-source.mjs',
  '/api/sync-pw-users': 'scripts/export-pw-users-to-xlsx.mjs',
  '/api/sync-storage': 'scripts/sync-storage-source.mjs',
  '/api/sync-tickets': 'scripts/sync-tickets-source.mjs',
};
const mime = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('Requisicao muito grande.'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return new URL(origin).host === (request.headers['x-forwarded-host'] || request.headers.host);
}

function json(response, result) {
  response.statusCode = result.status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
}

function runSync(pathname) {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(projectRoot, syncScripts[pathname])], { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) return resolve({ error: stderr.trim() || stdout.trim() || error.message, status: 500 });
      let sync;
      try { sync = stdout.trim() ? JSON.parse(stdout.trim()) : null; } catch { sync = null; }
      resolve({ body: { message: 'Fonte sincronizada.', sync }, status: 200 });
    });
  });
}

function serve(response, file) {
  response.statusCode = 200;
  response.setHeader('Content-Type', mime[extname(file).toLowerCase()] || 'application/octet-stream');
  createReadStream(file).pipe(response);
}

createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(request.method || 'GET') && !sameOrigin(request)) {
        return json(response, { error: 'Origem rejeitada.', status: 403 });
      }
      if (syncScripts[url.pathname]) {
        if (request.method !== 'POST') return json(response, { error: 'Metodo nao permitido.', status: 405 });
        const auth = await requireAdmin(request.headers);
        if (auth.error) return json(response, auth);
        return json(response, await runSync(url.pathname));
      }
      const body = ['GET', 'HEAD'].includes(request.method || 'GET') ? {} : await readJson(request);
      return json(response, await handleApiRequest({ body, headers: request.headers, method: request.method, url }));
    }
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = resolve(distRoot, relative);
    if ((file === distRoot || file.startsWith(`${distRoot}${sep}`)) && existsSync(file) && statSync(file).isFile()) return serve(response, file);
    return serve(response, join(distRoot, 'index.html'));
  } catch (error) {
    console.error(error);
    return json(response, { error: error instanceof Error ? error.message : 'Erro inesperado.', status: error.status || 500 });
  }
}).listen(port, '0.0.0.0', () => console.log(`Servidor iniciado na porta ${port}.`));
