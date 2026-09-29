export interface AuditCompany { uuid: string; nome: string }
export interface AuditOrigin { origem: string; total: number }
export interface AuditItem {
  uuid: string;
  numero: string | null;
  origem: string | null;
  natureza: string | null;
  classe: string | null;
  trecho: 'Norte' | 'Sul' | 'Não identificado' | null;
  status: string | null;
  rodovia: string | null;
  km: number | null;
  kmFinal: number | null;
  sentido: string | null;
  faixa: string | null;
  latitude: number | null;
  longitude: number | null;
  dataCriacao: string | null;
  dataExecucao: string | null;
  dataVencimento: string | null;
  link: string | null;
}
export interface AuditResult {
  success: true;
  companyUuid: string;
  origem: string;
  periodo: 'recente' | 'completo';
  janelaDesde: string | null;
  trechoDisponivel: boolean;
  totalConcessaoNaJanela: number;
  totalFiltrado: number;
  origensDisponiveis: AuditOrigin[];
  naturezasExcluidas: string[];
  fetchLatencyMs: number;
  fetchFailedPages: number;
  fetchDuplicatesRemoved: number;
  fromCache: boolean;
  cachedAgeSec: number | null;
  retrievedAt: string;
  items: AuditItem[];
}
export interface AuditParams {
  concessao: string;
  origem: string;
  periodo: 'recente' | 'completo';
  refresh?: boolean;
}
export interface AuditJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  params: AuditParams;
  error: string | null;
  retry_at?: string | null;
}
export class AuditRequestError extends Error {
  constructor(message: string, public status: number, public retryAfter: number = 0) { super(message); }
}
async function request<T>(path: string, signal?: AbortSignal, body?: AuditParams): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(abort, 60_000);
  try {
    const response = await fetch(`/api/kartado-audit${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new AuditRequestError(data?.error || 'Não foi possível consultar os apontamentos.', response.status, Number(response.headers.get('Retry-After')) || 0);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new AuditRequestError('A comunicação demorou mais que o esperado. Tente novamente.', 504);
    throw error;
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export const getAuditConfig = (signal?: AbortSignal) => request<{ provider: 'auditor' | 'legacy'; configured: boolean }>('/config', signal);
export const getAuditCompanies = (signal?: AbortSignal) => request<{ concessoes: AuditCompany[] }>('/concessoes', signal);
export const getAuditOrigins = (company: string, signal?: AbortSignal) => request<{ origensAmostra: AuditOrigin[]; sampleSize: number }>('/origens?' + new URLSearchParams({ concessao: company }), signal);
export const startAuditJob = (params: AuditParams, signal?: AbortSignal) => request<{ id: string }>('/jobs', signal, params);
export const getAuditJob = (id: string, signal?: AbortSignal) => request<AuditJob>(`/jobs/${encodeURIComponent(id)}`, signal);
export const getActiveAuditJob = (signal?: AbortSignal) => request<{ job: { id: string } | null }>('/jobs/active', signal);
export const getAuditResult = (id: string, signal?: AbortSignal) => request<AuditResult>(`/jobs/${encodeURIComponent(id)}/result`, signal);
