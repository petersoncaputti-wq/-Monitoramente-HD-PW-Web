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

const PAGE_SIZE = 1000;

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  return {
    anonKey,
    enabled: Boolean(url && anonKey),
    url,
  };
}

export function hasSupabaseProjectWiseUsersConfig(): boolean {
  return getSupabaseConfig().enabled;
}

async function readAllRecords<T>(
  accessToken: string,
  table: string,
  select: string,
  order: string,
): Promise<T[]> {
  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ler o Supabase.');
  }

  const records: T[] = [];
  let page = 0;

  while (true) {
    const endpoint = new URL(`/rest/v1/${table}`, config.url);
    endpoint.searchParams.set('select', select);
    endpoint.searchParams.set('order', order);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        Range: `${from}-${to}`,
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(
        details
          ? `Não foi possível ler ${table} no Supabase: ${details}`
          : `Não foi possível ler ${table} no Supabase.`,
      );
    }

    const pageRecords = (await response.json()) as T[];
    records.push(...pageRecords);

    if (pageRecords.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return records;
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
    'pw_explorer_users',
    [
      'nome',
      'email',
      'pw_id',
      'data_criacao',
      'descricao',
      'ultimo_acesso',
      'status',
      'status_acesso',
      'status_projectwise',
      'elegivel_exclusao',
      'motivo',
      'acao_executada',
      'resultado',
    ].join(','),
    'nome.asc',
  );

  return {
    fileName: 'Supabase - pw_explorer_users',
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
    'pw_portal_users',
    [
      'email',
      'communication_email',
      'first_name',
      'middle_name',
      'last_name',
      'profile_country',
      'language',
      'entitlement_country',
      'entitlement_groups',
      'cost_allocation_group',
      'user_management_groups',
      'roles',
      'global_fulfillment_contact',
      'fulfillment_contact_countries',
      'city',
      'company_name',
      'job_title',
      'locked',
      'profile_creation_date',
      'last_login_date',
      'mfa',
    ].join(','),
    'email.asc',
  );

  return {
    fileName: 'Supabase - pw_portal_users',
    headers: PORTAL_HEADERS,
    kind: 'projectWiseWebUsers',
    rows: records.map(mapPortalUser),
  };
}
