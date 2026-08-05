import type {
  ImportedWorkbookData,
  ProjectWiseUserRow,
  ProjectWiseWebUserRow,
} from '@/types/monitoring';

interface ProjectWiseExplorerUserRecord {
  acao_executada: string | null;
  data_criacao: string | null;
  descricao: string | null;
  elegivel_exclusao: string | null;
  email: string | null;
  motivo: string | null;
  nome: string | null;
  pw_id: string | null;
  resultado: string | null;
  status: string | null;
  status_acesso: string | null;
  status_projectwise: string | null;
  ultimo_acesso: string | null;
}

interface ProjectWisePortalUserRecord {
  city: string | null;
  communication_email: string | null;
  company_name: string | null;
  cost_allocation_group: string | null;
  email: string | null;
  entitlement_country: string | null;
  entitlement_groups: string | null;
  first_name: string | null;
  fulfillment_contact_countries: string | null;
  global_fulfillment_contact: string | null;
  job_title: string | null;
  language: string | null;
  last_login_date: string | null;
  last_name: string | null;
  locked: string | null;
  mfa: string | null;
  middle_name: string | null;
  profile_country: string | null;
  profile_creation_date: string | null;
  roles: string | null;
  user_management_groups: string | null;
}

const EXPLORER_HEADERS = [
  'Nome',
  'Email',
  'ID',
  'Datacriacao',
  'Descricao',
  'Ultimoacesso',
  'Status',
  'Statusacesso',
  'StatusProjectWise',
  'Elegivelexclusao',
  'Motivo',
  'Acaoexecutada',
  'Resultado',
];

const PORTAL_HEADERS = [
  'Email',
  'CommunicationEmail',
  'FirstName',
  'MiddleName',
  'LastName',
  'ProfileCountry',
  'Language',
  'EntitlementCountry',
  'EntitlementGroup(s)',
  'CostAllocationGroup',
  'UserManagementGroup(s)',
  'Role(s)',
  'GlobalFulfillmentContact',
  'FulfillmentContactCountry(s)',
  'City',
  'CompanyName',
  'JobTitle',
  'Locked',
  'ProfileCreationDate',
  'LastLoginDate',
  'MFA',
];

export function hasSupabaseProjectWiseUsersConfig(): boolean {
  return true;
}

async function readAllRecords<T>(
  _accessToken: string,
  sourceKind: 'explorer' | 'portal',
): Promise<T[]> {
  const response = await fetch(`/api/data/pw-users/${sourceKind}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível carregar os usuários ProjectWise.');
  return response.json() as Promise<T[]>;
}

function mapExplorerUser(record: ProjectWiseExplorerUserRecord): ProjectWiseUserRow {
  return {
    Acaoexecutada: record.acao_executada ?? '',
    Datacriacao: record.data_criacao ?? '',
    Descricao: record.descricao ?? '',
    Elegivelexclusao: record.elegivel_exclusao ?? '',
    Email: record.email ?? '',
    ID: record.pw_id ?? '',
    Motivo: record.motivo ?? '',
    Nome: record.nome ?? '',
    Resultado: record.resultado ?? '',
    Status: record.status ?? '',
    StatusProjectWise: record.status_projectwise ?? '',
    Statusacesso: record.status_acesso ?? '',
    Ultimoacesso: record.ultimo_acesso ?? '',
  };
}

function mapPortalUser(record: ProjectWisePortalUserRecord): ProjectWiseWebUserRow {
  return {
    City: record.city ?? '',
    CommunicationEmail: record.communication_email ?? '',
    CompanyName: record.company_name ?? '',
    CostAllocationGroup: record.cost_allocation_group ?? '',
    Email: record.email ?? '',
    EntitlementCountry: record.entitlement_country ?? '',
    'EntitlementGroup(s)': record.entitlement_groups ?? '',
    FirstName: record.first_name ?? '',
    'FulfillmentContactCountry(s)': record.fulfillment_contact_countries ?? '',
    GlobalFulfillmentContact: record.global_fulfillment_contact ?? '',
    JobTitle: record.job_title ?? '',
    Language: record.language ?? '',
    LastLoginDate: record.last_login_date ?? '',
    LastName: record.last_name ?? '',
    Locked: record.locked ?? '',
    MFA: record.mfa ?? '',
    MiddleName: record.middle_name ?? '',
    ProfileCountry: record.profile_country ?? '',
    ProfileCreationDate: record.profile_creation_date ?? '',
    'Role(s)': record.roles ?? '',
    'UserManagementGroup(s)': record.user_management_groups ?? '',
  };
}

export async function readProjectWiseExplorerUsersFromSupabase(
  accessToken: string,
): Promise<ImportedWorkbookData> {
  const records = await readAllRecords<ProjectWiseExplorerUserRecord>(
    accessToken,
    'explorer',
  );

  return {
    fileName: 'Azure PostgreSQL - pw_explorer_users',
    headers: EXPLORER_HEADERS,
    kind: 'projectWiseUsers',
    rows: records.map(mapExplorerUser),
  };
}

export async function readProjectWisePortalUsersFromSupabase(
  accessToken: string,
): Promise<ImportedWorkbookData> {
  const records = await readAllRecords<ProjectWisePortalUserRecord>(
    accessToken,
    'portal',
  );

  return {
    fileName: 'Azure PostgreSQL - pw_portal_users',
    headers: PORTAL_HEADERS,
    kind: 'projectWiseWebUsers',
    rows: records.map(mapPortalUser),
  };
}
