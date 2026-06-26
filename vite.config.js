import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
function storageSyncPlugin() {
    return {
        name: 'storage-sync-api',
        configureServer: function (server) {
            server.middlewares.use('/api/sync-storage', function (request, response) {
                if (request.method !== 'POST') {
                    response.statusCode = 405;
                    response.setHeader('Content-Type', 'application/json');
                    response.end(JSON.stringify({ error: 'Metodo nao permitido.' }));
                    return;
                }
                var scriptPath = fileURLToPath(new URL('./scripts/sync-storage-source.mjs', import.meta.url));
                execFile(process.execPath, [scriptPath], function (error, stdout, stderr) {
                    response.setHeader('Content-Type', 'application/json');
                    if (error) {
                        response.statusCode = 500;
                        response.end(JSON.stringify({
                            error: stderr.trim() || stdout.trim() || error.message,
                        }));
                        return;
                    }
                    response.statusCode = 200;
                    var output = stdout.trim();
                    var sync;
                    try {
                        sync = output ? JSON.parse(output) : null;
                    }
                    catch (_a) {
                        sync = null;
                    }
                    response.end(JSON.stringify({
                        message: sync
                            ? 'Fonte de armazenamento sincronizada.'
                            : output || 'Fonte de armazenamento sincronizada.',
                        sync: sync,
                    }));
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
