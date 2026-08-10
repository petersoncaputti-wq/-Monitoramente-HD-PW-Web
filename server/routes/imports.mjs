import { Router } from 'express';
import {
  getContentHash as getStorageHash,
  parseStorageCsv,
} from '../../api/storage-import.mjs';
import {
  assertRequiredHeaders,
  getContentHash as getWorkbookHash,
  mapExplorerRow,
  mapPortalRow,
  readWorkbookRows,
} from '../../api/pw-users-import.mjs';
import {
  assertE365Headers,
  getE365ContentHash,
  mapE365Row,
  readE365Rows,
} from '../../api/e365-import.mjs';
import { requireAdmin, requireUser } from '../auth.mjs';
import { query, withTransaction } from '../db.mjs';

const router = Router();
router.use(requireUser, requireAdmin);

async function insertRows(client, table, columns, rows, suffix = '') {
  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const tuples = chunk.map((row, rowIndex) => {
      return `(${columns.map((column, columnIndex) => {
        values.push(row[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      }).join(',')})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')} ${suffix}`,
      values,
    );
  }
}

router.post('/storage', async (request, response) => {
  const fileName = String(request.body?.fileName ?? '').trim();
  const content = String(request.body?.content ?? '');
  if (!fileName.toLowerCase().endsWith('.csv') || !content.trim()) {
    response.status(400).json({ error: 'Selecione um arquivo CSV válido.' });
    return;
  }
  const rows = parseStorageCsv(content);
  const fileHash = getStorageHash(content);
  const result = await withTransaction(async (client) => {
    const imported = await client.query(
      `insert into storage_imports (file_name,file_hash,rows_read,rows_imported,status)
       values ($1,$2,$3,0,'completed') returning id`,
      [fileName, fileHash, rows.length],
    );
    const importId = imported.rows[0].id;
    const mapped = rows.map((row) => ({ ...row, import_id: importId }));
    const columns = [
      'import_id','reading_date','reading_time','observed_at','computer','unit','total_gb','used_gb',
      'free_gb','percent_used','percent_free',
    ];
    await insertRows(
      client,
      'storage_readings',
      columns,
      mapped,
      `on conflict (observed_at,computer,unit) do update set
       import_id=excluded.import_id, reading_date=excluded.reading_date, reading_time=excluded.reading_time,
       total_gb=excluded.total_gb, used_gb=excluded.used_gb, free_gb=excluded.free_gb,
       percent_used=excluded.percent_used, percent_free=excluded.percent_free, updated_at=now()`,
    );
    await client.query('update storage_imports set rows_imported=$1 where id=$2', [rows.length, importId]);
    return { fileHash, fileName, importId, rowsImported: rows.length, rowsRead: rows.length };
  });
  response.json(result);
});

router.post('/pw-users', async (request, response) => {
  const fileName = String(request.body?.fileName ?? '').trim();
  const sourceKind = String(request.body?.sourceKind ?? '');
  const contentBase64 = String(request.body?.contentBase64 ?? '');
  if (!['explorer', 'portal'].includes(sourceKind) || !/\.(csv|xlsx|xls)$/i.test(fileName) || !contentBase64) {
    response.status(400).json({ error: 'Arquivo ou fonte de usuários inválida.' });
    return;
  }
  const buffer = Buffer.from(contentBase64, 'base64');
  const rows = readWorkbookRows(buffer);
  if (!rows.length) {
    response.status(400).json({ error: 'Nenhuma linha foi encontrada no arquivo.' });
    return;
  }
  assertRequiredHeaders(rows, sourceKind);
  const fileHash = getWorkbookHash(buffer);
  const result = await withTransaction(async (client) => {
    const imported = await client.query(
      `insert into pw_user_imports
       (source_kind,file_name,file_hash,rows_read,rows_imported,status,imported_by)
       values ($1,$2,$3,$4,0,'completed',$5) returning id`,
      [sourceKind, fileName, fileHash, rows.length, request.user.id],
    );
    const importId = imported.rows[0].id;
    const table = sourceKind === 'explorer' ? 'pw_explorer_users' : 'pw_portal_users';
    const mapped = rows.map((row) => sourceKind === 'explorer' ? mapExplorerRow(row, importId) : mapPortalRow(row, importId));
    const columns = sourceKind === 'explorer'
      ? ['import_id','nome','email','pw_id','data_criacao','descricao','ultimo_acesso','status','status_acesso','status_projectwise','elegivel_exclusao','motivo','acao_executada','resultado','raw_data']
      : ['import_id','email','communication_email','first_name','middle_name','last_name','profile_country','language','entitlement_country','entitlement_groups','cost_allocation_group','user_management_groups','roles','global_fulfillment_contact','fulfillment_contact_countries','city','company_name','job_title','locked','profile_creation_date','last_login_date','mfa','raw_data'];
    await client.query(`delete from ${table}`);
    await insertRows(client, table, columns, mapped);
    await client.query('update pw_user_imports set rows_imported=$1 where id=$2', [rows.length, importId]);
    return { fileHash, fileName, importId, rowsImported: rows.length, rowsRead: rows.length, sourceKind };
  });
  response.json(result);
});

router.post('/e365', async (request, response) => {
  const fileName = String(request.body?.fileName ?? '').trim();
  const contentBase64 = String(request.body?.contentBase64 ?? '');

  if (!/\.(csv|xlsx|xls)$/i.test(fileName) || !contentBase64) {
    response.status(400).json({ error: 'Selecione um arquivo E365 CSV, XLS ou XLSX válido.' });
    return;
  }

  const buffer = Buffer.from(contentBase64, 'base64');
  const rows = readE365Rows(buffer);
  if (!rows.length) {
    response.status(400).json({ error: 'Nenhuma linha E365 foi encontrada no arquivo.' });
    return;
  }

  try {
    assertE365Headers(rows);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Cabeçalhos E365 inválidos.',
    });
    return;
  }
  const fileHash = getE365ContentHash(buffer);
  const duplicate = await queryDuplicateImport(fileHash);
  if (duplicate) {
    response.status(409).json({ error: 'Este arquivo E365 já foi importado.' });
    return;
  }

  const result = await withTransaction(async (client) => {
    const imported = await client.query(
      `insert into e365_imports
       (file_name,file_hash,rows_read,rows_imported,status,imported_by)
       values ($1,$2,$3,0,'completed',$4) returning id`,
      [fileName, fileHash, rows.length, request.user.id],
    );
    const importId = imported.rows[0].id;
    const mappedByKey = new Map();
    for (const row of rows) {
      const mapped = mapE365Row(row, importId);
      mappedByKey.set(`${mapped.usage_quarter}|${mapped.ims_id}|${mapped.product_id}`, mapped);
    }
    const mapped = [...mappedByKey.values()];
    const columns = [
      'import_id','ultimate_id','account_name','country_iso','product_id','product_name',
      'connection_status','ims_id','persona_email','usage_date','usage_quarter','usage_interval',
      'currency','gross_amount','net_amount','exported_at','raw_data',
    ];
    await insertRows(
      client,
      'e365_usage',
      columns,
      mapped,
      `on conflict (usage_quarter,ims_id,product_id) do update set
       import_id=excluded.import_id, ultimate_id=excluded.ultimate_id,
       account_name=excluded.account_name, country_iso=excluded.country_iso,
       product_name=excluded.product_name, connection_status=excluded.connection_status,
       persona_email=excluded.persona_email, usage_date=excluded.usage_date,
       usage_interval=excluded.usage_interval, currency=excluded.currency,
       gross_amount=excluded.gross_amount, net_amount=excluded.net_amount,
       exported_at=excluded.exported_at, raw_data=excluded.raw_data, updated_at=now()`,
    );
    await client.query('update e365_imports set rows_imported=$1 where id=$2', [mapped.length, importId]);
    return { fileHash, fileName, importId, rowsImported: mapped.length, rowsRead: rows.length };
  });

  response.json(result);
});

async function queryDuplicateImport(fileHash) {
  const result = await query(
    `select id from e365_imports where file_hash=$1 and status='completed' limit 1`,
    [fileHash],
  );
  return result.rows[0] ?? null;
}

export default router;
