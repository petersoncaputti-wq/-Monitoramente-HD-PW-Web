import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../server/db.mjs';

const pool = createPool({ migration: true });

try {
  const schema = await readFile(resolve('azure/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Esquema Azure aplicado com sucesso.');
} finally {
  await pool.end();
}
