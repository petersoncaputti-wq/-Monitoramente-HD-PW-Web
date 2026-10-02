import type { AuditItem } from './kartadoAuditService';

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const date = (value: unknown) => text(value)?.slice(0, 10) || null;
export function normalizeUnitReporting(row: Row): AuditItem {
  const direction = text(row.direction)?.trim() || text(row.sentido)?.trim() || null;
  return {
    uuid: text(row.id || row.uuid) || '', numero: text(row.number), origem: text(row.origin),
    natureza: text(row.natureza)?.trim() || text(row.occurrenceKind)?.trim() || null, classe: text(row.classe || row.occurrenceType),
    trecho: direction?.toLowerCase() === 'norte' ? 'Norte' : direction?.toLowerCase() === 'sul' ? 'Sul' : 'Não identificado',
    status: text(row.status), rodovia: text(row.roadName),
    km: row.km != null && Number.isFinite(Number(row.km)) ? Number(row.km) : null,
    kmFinal: row.endKm != null && Number.isFinite(Number(row.endKm)) ? Number(row.endKm) : null,
    sentido: direction, faixa: text(row.faixa), latitude: null, longitude: null,
    dataCriacao: date(row.createdAt), dataExecucao: date(row.executedAt), dataVencimento: date(row.prazo), link: text(row.link),
  };
}
export class ReportingPageError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0) { super(message); }
}
export async function loadUnitReportingPage(company: string, page: number, signal: AbortSignal) {
  const response = await fetch('/api/v1/kartado/reportings/page', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyUuid: company, page }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ReportingPageError(`Página ${page}: ${data?.error || 'Falha ao carregar apontamentos.'} (HTTP ${response.status})`, response.status, Number(response.headers.get('Retry-After')) || 0);
  if (!data) throw new ReportingPageError(`Página ${page}: resposta inválida do servidor.`, 502);
  if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.pages) || data.pages < 1) throw new Error('Paginação inválida na resposta do Kartado.');
  const items = data.items.map(normalizeUnitReporting) as AuditItem[];
  if (items.some(item => !item.uuid)) throw new Error('A API retornou apontamentos sem identificação.');
  return { items, total: data.total as number, pages: data.pages as number };
}

type ReportingPage = Awaited<ReturnType<typeof loadUnitReportingPage>>;
export type ReportingProgress = {
  items: AuditItem[]; total: number; pages: number; processed: number;
  failedPages: number[]; changed: boolean; duplicates: number;
};
function waitForRetry(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Consulta interrompida', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}

// A primeira página define o tamanho da consulta. Lotes de três preservam capacidade
// para as outras telas e limitam também as atualizações pesadas dos gráficos.
export async function loadUnitReportings(
  company: string, signal: AbortSignal, onProgress: (value: ReportingProgress) => void,
  loadPage: (company: string, page: number, signal: AbortSignal) => Promise<ReportingPage> = loadUnitReportingPage,
) {
  const collected = new Map<string, AuditItem>();
  const failedPages: number[] = [];
  const failureDetails: string[] = [];
  let processed = 0, changed = false, duplicates = 0;
  let cooldownUntil = 0;
  async function fetchPage(page: number): Promise<ReportingPage> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      if (cooldownUntil > Date.now()) await waitForRetry(cooldownUntil - Date.now(), signal);
      try { return await loadPage(company, page, signal); }
      catch (error) {
        signal.throwIfAborted();
        const transient = error instanceof TypeError || (error instanceof ReportingPageError && [408, 429, 500, 502, 503, 504].includes(error.status));
        if (!transient || attempt >= 2) throw error;
        const delay = error instanceof ReportingPageError && error.retryAfter > 0 ? error.retryAfter * 1000 : 1000 * 2 ** attempt;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
      }
    }
  }
  const first = await fetchPage(1);
  signal.throwIfAborted();
  function accept(data: ReportingPage) {
    if (data.total !== first.total || data.pages !== first.pages) changed = true;
    for (const item of data.items) {
      if (collected.has(item.uuid)) duplicates++;
      collected.set(item.uuid, item);
    }
  }
  const snapshot = (): ReportingProgress => ({ items: [...collected.values()], total: first.total, pages: first.pages, processed, failedPages: [...failedPages], changed, duplicates });
  accept(first); processed++; onProgress(snapshot());
  for (let start = 2; start <= first.pages; start += 3) {
    signal.throwIfAborted();
    const pages = Array.from({ length: Math.min(3, first.pages - start + 1) }, (_, index) => start + index);
    const results = await Promise.allSettled(pages.map(page => fetchPage(page)));
    signal.throwIfAborted();
    let fatal: Error | undefined;
    results.forEach((result, index) => {
      processed++;
      if (result.status === 'fulfilled') accept(result.value);
      else {
        failedPages.push(pages[index]);
        failureDetails.push(`Página ${pages[index]}: ${result.reason instanceof ReportingPageError ? `HTTP ${result.reason.status}` : result.reason instanceof Error ? result.reason.message : 'erro de comunicação'}`);
        if (result.reason instanceof ReportingPageError && [401, 403, 429].includes(result.reason.status)) fatal = result.reason;
      }
    });
    onProgress(snapshot());
    if (fatal) throw fatal;
  }
  const result = snapshot();
  const problems = [
    failedPages.length ? `Falha nas páginas: ${failedPages.join(', ')}. ${failureDetails.slice(0, 5).join('; ')}.` : '',
    changed ? 'O total da API mudou durante a consulta.' : '',
    result.items.length !== result.total ? `Recebidos ${result.items.length.toLocaleString('pt-BR')} registros únicos de ${result.total.toLocaleString('pt-BR')} informados pela API.` : '',
    duplicates ? `${duplicates.toLocaleString('pt-BR')} registros repetidos entre páginas foram removidos.` : '',
  ].filter(Boolean);
  return { ...result, issue: problems.join(' ') };
}
