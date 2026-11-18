import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.mjs';

const pool = createPool({ migration: true });
try {
  await pool.query(await readFile(new URL('../azure/remove-projectwise-ticket-priority.sql', import.meta.url), 'utf8'));
  console.log('ProjectWise: coluna tickets.priority removida.');
} finally {
  await pool.end();
}
