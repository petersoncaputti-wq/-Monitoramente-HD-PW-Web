import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

const EXPLORER_REQUIRED_HEADERS = [
  'Nome',
  'Email',
  'ID',
  'Ultimoacesso',
  'Status',
  'Statusacesso',
  'StatusProjectWise',
  'Elegivelexclusao',
];

const PORTAL_REQUIRED_HEADERS = ['Email', 'Locked', 'ProfileCreationDate', 'LastLoginDate'];

function getEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error('Variaveis Supabase ausentes no servidor.');
  }

  return { publishableKey, secretKey, url };
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function supabaseRequest(path, options = {}) {
  const { secretKey, url } = getEnv();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pw-users-import-api/1.0',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  return parseJsonResponse(response);
}

async function getCaller(accessToken) {
  const { publishableKey, url } = getEnv();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseJsonResponse(response);
}

async function assertAdmin(headers) {
  const authorization = headers.authorization ?? headers.Authorization ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return { error: 'Sessão ausente.', status: 401 };
  }

  const caller = await getCaller(accessToken);
  const profiles = await supabaseRequest(
    `/rest/v1/app_profiles?select=id,email,role&id=eq.${encodeURIComponent(caller.id)}&limit=1`,
  );

  if (profiles[0]?.role !== 'admin') {
    return { error: 'Acesso restrito a administradores.', status: 403 };
  }

  return { caller, profile: profiles[0] };
}

function normalizeHeader(value) {
  const compactHeader = String(value ?? '').trim().replace(/\s+/g, '');
  const aliasKey = compactHeader
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const aliases = {
    acaoexecutada: 'Acaoexecutada',
    aaaoexecutada: 'Acaoexecutada',
    bloqueado: 'Locked',
    criacaodoperfil: 'ProfileCreationDate',
    datacriaaao: 'Datacriacao',
    datacriacao: 'Datacriacao',
    elegivelexclusao: 'Elegivelexclusao',
    email: 'Email',
    emailaddress: 'Email',
    emai: 'Email',
    ultimologin: 'LastLoginDate',
    ultimoacesso: 'Ultimoacesso',
  };

  return aliases[aliasKey] ?? compactHeader;
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [normalizeHeader(key), value])
      .filter(([key]) => key && !/^__EMPTY(?:_\d+)?$/i.test(key)),
  );
}

function getContentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, {
    cellDates: false,
    raw: false,
    type: 'buffer',
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  return XLSX.utils
    .sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false })
    .map(normalizeRow)
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
}

function assertRequiredHeaders(rows, sourceKind) {
  const headers = new Set(Object.keys(rows[0] ?? {}).map(normalizeHeader));
  const requiredHeaders =
    sourceKind === 'explorer' ? EXPLORER_REQUIRED_HEADERS : PORTAL_REQUIRED_HEADERS;
  const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Cabecalhos ausentes: ${missingHeaders.join(', ')}`);
  }
}

function asText(value) {
  return String(value ?? '').trim();
}

function mapExplorerRow(row, importId) {
  return {
    acao_executada: asText(row.Acaoexecutada),
    data_criacao: asText(row.Datacriacao),
    descricao: asText(row.Descricao),
    elegivel_exclusao: asText(row.Elegivelexclusao),
    email: asText(row.Email),
    import_id: importId,
    motivo: asText(row.Motivo),
    nome: asText(row.Nome),
    pw_id: asText(row.ID),
    raw_data: row,
    resultado: asText(row.Resultado),
    status: asText(row.Status),
    status_acesso: asText(row.Statusacesso),
    status_projectwise: asText(row.StatusProjectWise),
    ultimo_acesso: asText(row.Ultimoacesso),
  };
}

function mapPortalRow(row, importId) {
  return {
    city: asText(row.City),
    communication_email: asText(row.CommunicationEmail),
    company_name: asText(row.CompanyName),
    cost_allocation_group: asText(row.CostAllocationGroup),
    email: asText(row.Email),
    entitlement_country: asText(row.EntitlementCountry),
    entitlement_groups: asText(row['EntitlementGroup(s)']),
    first_name: asText(row.FirstName),
    fulfillment_contact_countries: asText(row['FulfillmentContactCountry(s)']),
    global_fulfillment_contact: asText(row.GlobalFulfillmentContact),
    import_id: importId,
    job_title: asText(row.JobTitle),
    language: asText(row.Language),
    last_login_date: asText(row.LastLoginDate),
    locked: asText(row.Locked),
    mfa: asText(row.MFA),
    middle_name: asText(row.MiddleName),
    last_name: asText(row.LastName),
    profile_country: asText(row.ProfileCountry),
    profile_creation_date: asText(row.ProfileCreationDate),
    raw_data: row,
    roles: asText(row['Role(s)']),
    user_management_groups: asText(row['UserManagementGroup(s)']),
  };
}

async function insertInChunks(table, rows) {
  const chunkSize = 500;
  let inserted = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const result = await supabaseRequest(`/rest/v1/${table}`, {
      body: JSON.stringify(chunk),
      method: 'POST',
    });
    inserted += result.length;
  }

  return inserted;
}

async function importProjectWiseUsers(body, caller) {
  const fileName = String(body.fileName ?? '').trim();
  const sourceKind = String(body.sourceKind ?? '').trim();
  const contentBase64 = String(body.contentBase64 ?? '');

  if (sourceKind !== 'explorer' && sourceKind !== 'portal') {
    return { error: 'Fonte invalida para importacao.', status: 400 };
  }

  if (!/\.(csv|xlsx|xls)$/i.test(fileName)) {
    return { error: 'Selecione um arquivo .csv, .xlsx ou .xls.', status: 400 };
  }

  if (!contentBase64.trim()) {
    return { error: 'O arquivo esta vazio.', status: 400 };
  }

  const buffer = Buffer.from(contentBase64, 'base64');
  const fileHash = getContentHash(buffer);
  const rows = readWorkbookRows(buffer);

  if (rows.length === 0) {
    return { error: 'Nenhuma linha foi encontrada no arquivo.', status: 400 };
  }

  assertRequiredHeaders(rows, sourceKind);

  const [importRecord] = await supabaseRequest('/rest/v1/pw_user_imports', {
    body: JSON.stringify([
      {
        file_hash: fileHash,
        file_name: fileName,
        imported_by: caller.id,
        rows_imported: 0,
        rows_read: rows.length,
        source_kind: sourceKind,
        status: 'completed',
      },
    ]),
    method: 'POST',
  });

  const table = sourceKind === 'explorer' ? 'pw_explorer_users' : 'pw_portal_users';
  await supabaseRequest(`/rest/v1/${table}?id=not.is.null`, {
    headers: { Prefer: 'return=minimal' },
    method: 'DELETE',
  });

  const mappedRows = rows.map((row) =>
    sourceKind === 'explorer'
      ? mapExplorerRow(row, importRecord.id)
      : mapPortalRow(row, importRecord.id),
  );
  const rowsImported = await insertInChunks(table, mappedRows);

  await supabaseRequest(`/rest/v1/pw_user_imports?id=eq.${importRecord.id}`, {
    body: JSON.stringify({
      rows_imported: rowsImported,
      status: 'completed',
    }),
    method: 'PATCH',
  });

  return {
    body: {
      fileHash,
      fileName,
      importId: importRecord.id,
      rowsImported,
      rowsRead: rows.length,
      sourceKind,
    },
    status: 200,
  };
}

export async function handleProjectWiseUsersImportRequest({ body, headers, method }) {
  if (method !== 'POST') {
    return { error: 'Método não permitido.', status: 405 };
  }

  const adminCheck = await assertAdmin(headers);

  if (adminCheck.error) {
    return adminCheck;
  }

  return importProjectWiseUsers(body ?? {}, adminCheck.caller);
}

export default async function handler(request, response) {
  try {
    const result = await handleProjectWiseUsersImportRequest({
      body: request.body ?? {},
      headers: request.headers,
      method: request.method,
    });

    response.status(result.status).json(result.error ? { error: result.error } : result.body);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Erro inesperado.',
    });
  }
}
