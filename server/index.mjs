import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { query } from './db.mjs';
import authRouter from './routes/auth.mjs';
import adminUsersRouter from './routes/admin-users.mjs';
import dataRouter from './routes/data.mjs';
import ticketsRouter from './routes/tickets.mjs';
import importsRouter from './routes/imports.mjs';
import { kartadoRouter } from './routes/kartado.mjs';
import { requireUser } from './auth.mjs';
import totvsRouter from './routes/totvs.mjs';

const app = express();
const port = Number(process.env.PORT || 8080);
const distPath = resolve('dist');
const localEnvPath = resolve('.env.local');

if (existsSync(localEnvPath) && process.env.NODE_ENV !== 'production') {
  for (const line of readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
);
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', async (_request, response) => {
  try {
    await query('select 1');
    response.json({ database: 'connected', status: 'ok' });
  } catch (error) {
    console.error('Health check database error:', error);
    response.status(503).json({ database: 'unavailable', status: 'error' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/admin-users', adminUsersRouter);
app.use('/api/data', dataRouter);
app.use('/api/totvs', totvsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/storage-import', (request, response, next) => {
  request.url = '/storage';
  importsRouter(request, response, next);
});
app.use('/api/pw-users-import', (request, response, next) => {
  request.url = '/pw-users';
  importsRouter(request, response, next);
});
app.use('/api/e365-import', (request, response, next) => {
  request.url = '/e365';
  importsRouter(request, response, next);
});
app.use('/api/v1/kartado', requireUser, kartadoRouter);

if (existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }));
  app.use((_request, response) => response.sendFile(resolve(distPath, 'index.html')));
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor iniciado na porta ${port}.`);
});
