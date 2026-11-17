import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
// Em desenvolvimento, todas as rotas /api vão para o servidor Express local
// (npm run dev sobe os dois). Antes, plugins daqui desviavam /api/admin-users,
// /api/tickets e as importações para os handlers antigos do Supabase.
export default defineConfig({
    plugins: [react()],
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
