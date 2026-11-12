// Entrada independente: não carrega autenticação, banco ou APIs do painel.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root, configFile: false, envFile: false,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  optimizeDeps: { entries: ['inventario-preview.html'] },
  server: { host: '127.0.0.1', port: 5184, strictPort: true },
});
await server.listen();
console.log('\nPrévia do Inventário: http://127.0.0.1:5184/inventario-preview.html');
console.log('Dados fictícios. Nenhuma conexão com o Kartado ou alteração em produção.');
async function stop() { await server.close(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
