// Leitura das planilhas de usuários ProjectWise (Explorer e Portal Bentley).
// Extraído de api/pw-users-import.mjs (handler antigo do Supabase/Vercel).
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

function normalizeHeader(value) {
  const compactHeader = String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
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

export function getContentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function readWorkbookRows(buffer) {
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

export function assertRequiredHeaders(rows, sourceKind) {
  const headers = new Set(Object.keys(rows[0] ?? {}).map(normalizeHeader));
  const requiredHeaders = sourceKind === 'explorer' ? EXPLORER_REQUIRED_HEADERS : PORTAL_REQUIRED_HEADERS;
  const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Cabecalhos ausentes: ${missingHeaders.join(', ')}`);
  }
}

function asText(value) {
  return String(value ?? '').trim();
}

export function mapExplorerRow(row, importId) {
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

export function mapPortalRow(row, importId) {
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
