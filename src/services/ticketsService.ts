import type { ImportedWorkbookData, TicketRow } from '@/types/monitoring';

export interface TicketRecord {
  assigned_agent: string | null;
  assigned_group: string | null;
  assigned_to: string | null;
  beneficiary_organization: string | null;
  case_number: string | null;
  closed_at: string | null;
  id: string;
  opened_at: string;
  priority: string | null;
  reason: string | null;
  requested_for: string | null;
  requester: string | null;
  requester_organization: string | null;
  sla_status: string | null;
  status: string;
  ticket_type: string | null;
  updated_at: string | null;
}

export interface TicketInput {
  assignedAgent?: string;
  assignedGroup?: string;
  assignedTo?: string;
  beneficiaryOrganization?: string;
  caseNumber?: string;
  closedAt?: string;
  id?: string;
  openedAt: string;
  priority?: string;
  reason?: string;
  requestedFor?: string;
  requester?: string;
  requesterOrganization?: string;
  slaStatus?: string;
  status: string;
  ticketType?: string;
  updatedAt?: string;
}

const TICKET_HEADERS = [
  'Caso n.º',
  'Status',
  'Motivo',
  'Abertoem',
  'Atualizado',
  'Fechadoem',
  'Prioridade',
  'Solicitante',
  'Organizaçãodosolicitante',
  'AgenteAtribuído',
  'Atribuído',
  'Grupoatribuído',
  'Tipodeticket',
  'StatusdoSLA',
  'Organizaçãodobeneficiário',
  'Solicitadopara',
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

export function hasSupabaseTicketsConfig(): boolean {
  return getSupabaseConfig().enabled;
}

function formatTicketDate(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function mapTicketRecord(record: TicketRecord): TicketRow {
  return {
    Abertoem: formatTicketDate(record.opened_at),
    'AgenteAtribu\u00c3\u00addo': record.assigned_agent ?? '',
    'AgenteAtribu\u00eddo': record.assigned_agent ?? '',
    Atualizado: formatTicketDate(record.updated_at),
    'Atribu\u00c3\u00addo': record.assigned_to ?? '',
    'Atribu\u00eddo': record.assigned_to ?? '',
    'Cason.\u00c2\u00ba': record.case_number ?? '',
    'Caso n.\u00ba': record.case_number ?? '',
    Fechadoem: formatTicketDate(record.closed_at),
    'Grupoatribu\u00c3\u00addo': record.assigned_group ?? '',
    'Grupoatribu\u00eddo': record.assigned_group ?? '',
    Motivo: record.reason ?? '',
    'Organiza\u00c3\u00a7\u00c3\u00a3odobenefici\u00c3\u00a1rio': record.beneficiary_organization ?? '',
    'Organiza\u00e7\u00e3odobenefici\u00e1rio': record.beneficiary_organization ?? '',
    'Organiza\u00c3\u00a7\u00c3\u00a3odosolicitante': record.requester_organization ?? '',
    'Organiza\u00e7\u00e3odosolicitante': record.requester_organization ?? '',
    Prioridade: record.priority ?? '',
    Solicitadopara: record.requested_for ?? '',
    Solicitante: record.requester ?? '',
    Status: record.status,
    StatusdoSLA: record.sla_status ?? '',
    Tipodeticket: record.ticket_type ?? '',
    __id: record.id,
    __caseNumber: record.case_number ?? '',
    __closedAt: record.closed_at ?? '',
    __openedAt: record.opened_at,
    __updatedAt: record.updated_at ?? '',
  } as unknown as TicketRow;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    let parsedMessage = '';

    try {
      const parsedDetails = JSON.parse(details) as { error?: string; message?: string };
      parsedMessage = parsedDetails.message || parsedDetails.error || '';
    } catch {
      parsedMessage = '';
    }

    throw new Error(parsedMessage || details || `Erro HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function readTicketsFromSupabase(accessToken: string): Promise<ImportedWorkbookData> {
  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ler o Supabase.');
  }

  const records: TicketRecord[] = [];
  let page = 0;

  while (true) {
    const endpoint = new URL('/rest/v1/tickets', config.url);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'opened_at.desc');

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        Range: `${from}-${to}`,
      },
    });

    const pageRecords = await parseResponse<TicketRecord[]>(response);
    records.push(...pageRecords);

    if (pageRecords.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return {
    fileName: 'Supabase - tickets',
    headers: TICKET_HEADERS,
    kind: 'tickets',
    rows: records.map(mapTicketRecord),
  };
}

async function ticketsRequest<T>(
  accessToken: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
): Promise<T> {
  const response = await fetch('/api/tickets', {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method,
  });

  return parseResponse<T>(response);
}

export async function createTicket(accessToken: string, input: TicketInput): Promise<TicketRecord> {
  return ticketsRequest<TicketRecord>(accessToken, 'POST', input);
}

export async function updateTicket(accessToken: string, input: TicketInput): Promise<TicketRecord> {
  return ticketsRequest<TicketRecord>(accessToken, 'PATCH', input);
}

export async function deleteTicket(accessToken: string, id: string): Promise<{ id: string }> {
  return ticketsRequest<{ id: string }>(accessToken, 'DELETE', { id });
}
