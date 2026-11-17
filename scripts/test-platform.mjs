import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { useBodyParsers } from '../server/body-parsers.mjs';
import { httpErrorHandler } from '../server/http-error.mjs';

// 1. .env.local: carregado em desenvolvimento, sem sobrescrever o ambiente; ignorado em produção.
const loadEnv = fileURLToPath(new URL('../server/load-env.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'env-test-'));
try {
  writeFileSync(join(dir, '.env.local'), 'TESTE_ARQUIVO="do arquivo"\nTESTE_AMBIENTE=do-arquivo\n');
  const read = (nodeEnv) =>
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(loadEnv).href)}); console.log(JSON.stringify([process.env.TESTE_ARQUIVO ?? null, process.env.TESTE_AMBIENTE]))`,
      ],
      { cwd: dir, env: { ...process.env, NODE_ENV: nodeEnv, TESTE_AMBIENTE: 'do-ambiente' }, encoding: 'utf8' },
    );
  assert.deepEqual(JSON.parse(read('development')), ['do arquivo', 'do-ambiente']);
  assert.deepEqual(JSON.parse(read('production')), [null, 'do-ambiente']);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 2. Limite de corpo: 25 MB só nas importações; 1 MB no restante.
const app = express();
useBodyParsers(app);
app.post(['/api/storage-import', '/api/tickets'], (request, response) =>
  response.json({ bytes: JSON.stringify(request.body).length }),
);
app.use(httpErrorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const payload = JSON.stringify({ content: 'x'.repeat(2 * 1024 * 1024) });
  const send = (path, body = payload) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await send('/api/storage-import')).status, 200);
  assert.equal((await send('/api/tickets')).status, 413);
  assert.equal((await send('/api/tickets', '{"ok":true}')).status, 200);
} finally {
  server.close();
}

console.log(
  'Plataforma: .env.local só em desenvolvimento sem sobrescrever o ambiente e limite de corpo por rota (25 MB importações, 1 MB demais): OK.',
);
