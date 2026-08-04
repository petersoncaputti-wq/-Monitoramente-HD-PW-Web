let pool;
let poolPromise;

export async function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL nao configurada no servidor.');

  poolPromise ??= (async () => {
    // Computed import keeps the Vite frontend build independent from backend dependencies.
    const moduleName = 'p' + 'g';
    const pg = await import(moduleName);
    const Pool = pg.Pool ?? pg.default.Pool;
    pool = new Pool({
      connectionString,
      max: Math.max(1, Number(process.env.DATABASE_POOL_MAX || 10)),
      ssl: connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    });
    return pool;
  })();
  return poolPromise;
}

export async function query(text, values = []) {
  return (await getPool()).query(text, values);
}

export async function transaction(callback) {
  const client = await (await getPool()).connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function insertRows(client, table, rows, conflict = '') {
  if (!rows.length) return [];
  const allowedTables = new Set(['storage_readings', 'pw_explorer_users', 'pw_portal_users']);
  if (!allowedTables.has(table)) throw new Error('Tabela de importacao invalida.');
  const columns = Object.keys(rows[0]);
  const values = [];
  const groups = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(column === 'raw_data' ? JSON.stringify(row[column]) : row[column]);
      return `$${values.length}${column === 'raw_data' ? '::jsonb' : ''}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const result = await client.query(
    `insert into ${table} (${columns.join(', ')}) values ${groups.join(', ')} ${conflict} returning id`,
    values,
  );
  return result.rows;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
  poolPromise = undefined;
}
