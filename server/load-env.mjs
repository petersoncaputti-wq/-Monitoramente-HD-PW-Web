import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carrega .env.local em desenvolvimento, antes de qualquer outro módulo do
// servidor (importe este arquivo primeiro: em ESM os imports rodam antes do
// corpo do arquivo, e alguns módulos leem process.env ao serem carregados).
// Variáveis já definidas no ambiente têm precedência. Em produção (App
// Service), a configuração vem só das App Settings.
const localEnvPath = resolve('.env.local');

if (process.env.NODE_ENV !== 'production' && existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}
