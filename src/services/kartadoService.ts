export interface KartadoCompany {
  id?: string;
  uuid: string;
  name: string;
}

export interface KartadoUser {
  id?: string;
  fullName?: string;
  username?: string | null;
  email?: string | null;
  isInternal?: boolean;
  isSupervisor?: boolean;
  expirationDate?: string | null;
  lastLogin?: string | null;
  riskLevel?: 'danger' | 'warning' | 'info' | 'ok';
  risks?: Array<{ level: string; msg: string }>;
}

export interface KartadoReporting {
  id?: string;
  number?: string | number | null;
  roadName?: string | null;
  km?: string | number | null;
  status?: string | null;
  occurrenceType?: string | null;
  foundAt?: string | null;
  createdAt?: string | null;
}

export interface KartadoAlert {
  id: string;
  severity: 'danger' | 'warning' | 'info' | string;
  title: string;
  desc?: string;
  action?: string;
  count?: number;
}

export interface KartadoConcessionDashboard {
  company: KartadoCompany;
  alerts?: KartadoAlert[];
  summary: Record<string, number | string | null>;
  users: { users: KartadoUser[]; counts: Record<string, number>; alertas?: KartadoAlert[] };
  reportings: {
    items: KartadoReporting[];
    recent?: KartadoReporting[];
    alerts?: KartadoAlert[];
    counts: Record<string, number>;
    byStatus?: Array<{ name: string; count: number }>;
    byType?: Array<{ name: string; count: number }>;
    byRoad?: Array<{ name: string; count: number }>;
  };
}

export interface KartadoDashboard {
  concessoes: KartadoConcessionDashboard[];
  totals: { usuariosAtivos: number; apontamentos: number; alertas: number; criticos: number };
  generatedAt: string;
  source: string;
}

export async function loadKartadoCompanies(): Promise<KartadoCompany[]> {
  const result = await request<{ success: boolean; companies: KartadoCompany[]; error?: string }>(
    '/companies',
  );
  if (!result.success) throw new Error(result.error || 'Concessões Kartado indisponíveis.');
  return result.companies || [];
}

export async function loadKartadoConcession(
  company: KartadoCompany,
  options: { summaryOnly?: boolean; force?: boolean } = {},
): Promise<KartadoConcessionDashboard> {
  const result = await request<{
    success: boolean;
    dashboard: KartadoConcessionDashboard;
    error?: string;
  }>('/dashboard', {
    companyUuid: company.uuid || company.id,
    companyName: company.name,
    summaryOnly: options.summaryOnly || false,
    force: options.force || false,
  });
  if (!result.success || !result.dashboard) {
    throw new Error(result.error || `Dados de ${company.name} indisponíveis.`);
  }
  return result.dashboard;
}

async function request<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(`/api/v1/kartado${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A consulta ao Kartado excedeu 90 segundos. Tente novamente.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Falha ao consultar o Kartado (${response.status}).`);
  }
  return payload;
}

export async function loadKartadoDashboard(): Promise<KartadoDashboard> {
  const result = await request<{ success: boolean; dashboard: KartadoDashboard; error?: string }>('/multi');
  if (!result.success || !result.dashboard) throw new Error(result.error || 'Dashboard Kartado indisponível.');
  return result.dashboard;
}

export async function searchKartadoUsers(companyUuid: string, query: string): Promise<KartadoUser[]> {
  const result = await request<{ success: boolean; users: KartadoUser[]; error?: string }>('/search', {
    companyUuid,
    query,
  });
  if (!result.success) throw new Error(result.error || 'Busca Kartado indisponível.');
  return result.users || [];
}

export async function loadKartadoReportings(
  companyUuid: string,
): Promise<KartadoConcessionDashboard['reportings']> {
  const result = await request<{
    success: boolean;
    metrics?: KartadoConcessionDashboard['reportings'];
    error?: string;
  }>('/reportings', { companyUuid, pageSize: 100, maxPages: 2 });
  if (!result.success || !result.metrics) {
    throw new Error(result.error || 'Apontamentos Kartado indisponíveis.');
  }
  return result.metrics;
}
