import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

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
          fallbackMessage: 'Fonte de usuarios PW atualizada.',
          route: '/api/sync-pw-users',
          scriptPath: fileURLToPath(
            new URL('./scripts/export-pw-users-to-xlsx.mjs', import.meta.url),
          ),
        },
        {
          fallbackMessage: 'Fonte de usuarios do Portal Bentley atualizada.',
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
          response.end(JSON.stringify({ error: 'Metodo nao permitido.' }));
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

export default defineConfig({
  plugins: [react(), sourceSyncPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
