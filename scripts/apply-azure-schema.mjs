import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { closePool, query } from '../api/_database.mjs';

try {
  const path = fileURLToPath(new URL('../azure/schema.sql', import.meta.url));
  await query(await readFile(path, 'utf8'));
  console.log('Esquema do Azure PostgreSQL aplicado com sucesso.');
} finally {
  await closePool();
}
