import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

function loadLocalEnv() {
  const envPath = fileURLToPath(new URL('./.env.local', import.meta.url));

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf-8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    process.env[key] ??= rawValue.replace(/^["']|["']$/g, '');
  }
}

async function readJsonBody(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf-8').trim();

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function sourceSyncPlugin(): Plugin {
  return {
    name: 'source-sync-api',
    configureServer(server) {
      const routes = [
        {
          fallbackMessage: 'Fonte de armazenamento sincronizada.',
          route: '/api/sync-storage',
          scriptPath: fileURLToPath(
            new URL('./scripts/sync-storage-source.mjs', import.meta.url),
          ),
        },
        {
          fallbackMessage: 'Fonte de chamados sincronizada.',
          route: '/api/sync-tickets',
          scriptPath: fileURLToPath(
            new URL('./scripts/sync-tickets-source.mjs', import.meta.url),
          ),
        },
        {
          fallbackMessage: 'Fonte de usuários PW atualizada.',
          route: '/api/sync-pw-users',
          scriptPath: fileURLToPath(
            new URL('./scripts/export-pw-users-to-xlsx.mjs', import.meta.url),
          ),
        },
        {
          fallbackMessage: 'Fonte de usuários do Portal Bentley atualizada.',
          route: '/api/sync-portal-users',
          scriptPath: fileURLToPath(
            new URL('./scripts/sync-portal-users-source.mjs', import.meta.url),
          ),
        },
      ];

      for (const config of routes) {
        const { route } = config;
        server.middlewares.use(route, (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Método não permitido.' }));
          return;
        }

        execFile(process.execPath, [config.scriptPath], (error, stdout, stderr) => {
          response.setHeader('Content-Type', 'application/json');

          if (error) {
            response.statusCode = 500;
            response.end(
              JSON.stringify({
                error: stderr.trim() || stdout.trim() || error.message,
              }),
            );
            return;
          }

          response.statusCode = 200;

          const output = stdout.trim();
          let sync;

          try {
            sync = output ? JSON.parse(output) : null;
          } catch {
            sync = null;
          }

          response.end(
            JSON.stringify({
              message: sync
                ? config.fallbackMessage
                : output || config.fallbackMessage,
              sync,
            }),
          );
        });
      });
      }
    },
  };
}

function localAdminUsersApiPlugin(): Plugin {
  return {
    name: 'local-admin-users-api',
    configureServer(server) {
      loadLocalEnv();

      server.middlewares.use('/api/admin-users', async (request, response) => {
        try {
          const { handleAdminUsersRequest } = await import('./api/admin-users.mjs');
          const result = await handleAdminUsersRequest({
            body: request.method === 'GET' ? {} : await readJsonBody(request),
            headers: request.headers,
            method: request.method ?? 'GET',
          });

          response.statusCode = result.status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Erro inesperado.',
            }),
          );
        }
      });

      server.middlewares.use('/api/storage-import', async (request, response) => {
        try {
          const { handleStorageImportRequest } = await import('./api/storage-import.mjs');
          const result = await handleStorageImportRequest({
            body: await readJsonBody(request),
            headers: request.headers,
            method: request.method ?? 'POST',
          });

          response.statusCode = result.status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Erro inesperado.',
            }),
          );
        }
      });

      server.middlewares.use('/api/pw-users-import', async (request, response) => {
        try {
          const { handleProjectWiseUsersImportRequest } = await import(
            './api/pw-users-import.mjs'
          );
          const result = await handleProjectWiseUsersImportRequest({
            body: await readJsonBody(request),
            headers: request.headers,
            method: request.method ?? 'POST',
          });

          response.statusCode = result.status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Erro inesperado.',
            }),
          );
        }
      });

      server.middlewares.use('/api/tickets', async (request, response) => {
        try {
          const { handleTicketsRequest } = await import('./api/tickets.mjs');
          const result = await handleTicketsRequest({
            body: await readJsonBody(request),
            headers: request.headers,
            method: request.method ?? 'POST',
          });

          response.statusCode = result.status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Erro inesperado.',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sourceSyncPlugin(), localAdminUsersApiPlugin()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});

