import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

function storageSyncPlugin(): Plugin {
  return {
    name: 'storage-sync-api',
    configureServer(server) {
      server.middlewares.use('/api/sync-storage', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Metodo nao permitido.' }));
          return;
        }

        const scriptPath = fileURLToPath(
          new URL('./scripts/sync-storage-source.mjs', import.meta.url),
        );

        execFile(process.execPath, [scriptPath], (error, stdout, stderr) => {
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
                ? 'Fonte de armazenamento sincronizada.'
                : output || 'Fonte de armazenamento sincronizada.',
              sync,
            }),
          );
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), storageSyncPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
