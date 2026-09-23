import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../server/db.mjs';

const TABLES = {
  storage_imports: [
    'id', 'file_name', 'file_hash', 'rows_read', 'rows_imported', 'status', 'error_message', 'imported_at',
  ],
  storage_readings: [
    'id', 'import_id', 'reading_date', 'reading_time', 'observed_at', 'computer', 'unit', 'total_gb',
    'used_gb', 'free_gb', 'percent_used', 'percent_free', 'created_at', 'updated_at',
  ],
  tickets: [
    'id', 'case_number', 'status', 'reason', 'opened_at', 'updated_at', 'closed_at', 'priority',
    'requester', 'requester_organization', 'assigned_agent', 'assigned_to', 'assigned_group', 'ticket_type',
    'sla_status', 'beneficiary_organization', 'requested_for', 'created_at', 'updated_at_system',
  ],
  pw_user_imports: [
    'id', 'source_kind', 'file_name', 'file_hash', 'rows_read', 'rows_imported', 'status', 'error_message',
    'imported_at',
  ],
  pw_explorer_users: [
    'id', 'import_id', 'nome', 'email', 'pw_id', 'data_criacao', 'descricao', 'ultimo_acesso', 'status',
    'status_acesso', 'status_projectwise', 'elegivel_exclusao', 'motivo', 'acao_executada', 'resultado',
    'raw_data', 'created_at', 'updated_at',
  ],
  pw_portal_users: [
    'id', 'import_id', 'email', 'communication_email', 'first_name', 'middle_name', 'last_name',
    'profile_country', 'language', 'entitlement_country', 'entitlement_groups', 'cost_allocation_group',
    'user_management_groups', 'roles', 'global_fulfillment_contact', 'fulfillment_contact_countries',
    'city', 'company_name', 'job_title', 'locked', 'profile_creation_date', 'last_login_date', 'mfa',
    'raw_data', 'created_at', 'updated_at',
  ],
};

const INSERT_ORDER = [
  'storage_imports', 'storage_readings', 'tickets', 'pw_user_imports', 'pw_explorer_users', 'pw_portal_users',
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}.`);
  return value;
}

async function readSupabaseTable(baseUrl, serviceKey, table, columns) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('select', columns.join(','));
    url.searchParams.set('order', 'id.asc');
    const response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao exportar ${table}: ${await response.text()}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function insertRows(client, table, columns, rows) {
  const chunkSize = 200;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const tuples = chunk.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(row[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(',')})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`,
      values,
    );
  }
}

const supabaseUrl = required('MIGRATION_SUPABASE_URL');
const serviceKey = required('MIGRATION_SUPABASE_SERVICE_ROLE_KEY');
const confirmation = required('MIGRATION_CONFIRM_REPLACE');

if (confirmation !== 'REPLACE_AZURE_OPERATIONAL_DATA') {
  throw new Error('Confirmação de substituição inválida.');
}

const exported = {};
for (const [table, columns] of Object.entries(TABLES)) {
  exported[table] = await readSupabaseTable(supabaseUrl, serviceKey, table, columns);
  console.log(`Supabase ${table}: ${exported[table].length} registros.`);
}

const pool = createPool({ migration: true });
const client = await pool.connect();
const backupSchema = `backup_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

try {
  await client.query('begin');
  await client.query(`create schema ${backupSchema}`);

  for (const table of INSERT_ORDER) {
    const exists = await client.query('select to_regclass($1) as name', [`public.${table}`]);
    if (exists.rows[0]?.name) {
      await client.query(`create table ${backupSchema}.${table} as table public.${table}`);
    }
  }

  const schema = await readFile(resolve('azure/schema.sql'), 'utf8');
  await client.query(schema);
  await client.query(
    'truncate table storage_readings, storage_imports, tickets, pw_explorer_users, pw_portal_users, pw_user_imports restart identity cascade',
  );

  for (const table of INSERT_ORDER) {
    await insertRows(client, table, TABLES[table], exported[table]);
  }

  await client.query('alter table tickets validate constraint tickets_created_by_fkey');
  await client.query('alter table tickets validate constraint tickets_updated_by_fkey');
  await client.query('alter table pw_user_imports validate constraint pw_user_imports_imported_by_fkey');

  for (const table of INSERT_ORDER) {
    const count = await client.query(`select count(*)::int as count from ${table}`);
    if (count.rows[0].count !== exported[table].length) {
      throw new Error(`Contagem divergente em ${table}.`);
    }
  }

  await client.query('commit');
  console.log(`Migração concluída. Backup anterior preservado no schema ${backupSchema}.`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
