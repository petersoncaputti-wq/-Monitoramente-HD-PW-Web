export interface CollectionQuality {
  integridade: { completa: boolean; esperados: number; recebidos: number; faltando: number; paginasFalhas: number; motivos: string[] };
  atualidade: { geradoEm: string; idadeSeg: number; validadeSeg: number; expirado: boolean };
  atualizacao: { estado: 'ociosa' | 'em_andamento' | 'falhou' | 'incompleta'; erro?: string; motivos?: string[]; novaTentativaAPartirDe?: string };
}
export interface InventoryResult {
  success: true; status: 'pronto'; companyUuid: string; coletaCompleta: boolean;
  coleta: { inventario: CollectionQuality; apontamentos?: CollectionQuality }; avisos: string[];
}
export interface InventorySummary extends InventoryResult {
  totalInventarioConcessao: number; totalRecebido: number; totalFiltrado: number; comFoto: number; pctComFoto: number | null;
  porClasse: Array<{ classe: string; total: number; comFoto: number; pctComFoto: number | null }>;
  porRodovia: Array<{ rodovia: string; total: number; comFoto: number; pctComFoto: number | null }>;
}
export interface InventoryAsset {
  uuid: string; numero: string | null; classe: string | null; rodovia: string | null; km: number | null;
  kmFinal?: number | null; fotos?: number; sentido?: string | null; link?: string | null;
  apontamentos?: number; apontamentosNoStatus?: number; porStatus?: Record<string, number>;
}
export interface CrossingRow {
  classe?: string; rodovia?: string; ativos: number; ativosComApontamento: number; ativosSemApontamento: number | null;
  pctAtivosComApontamento: number | null; apontamentos: number; ativosComApontamentoNoStatus?: number; apontamentosNoStatus?: number;
  porStatus: Record<string, number>;
}
export interface InventoryCrossing extends InventoryResult {
  dimensao: 'classe' | 'rodovia' | 'ativo'; periodo: string; janelaDesde: string | null;
  totais: { ativosNoRecorte: number; ativosComApontamento: number; ativosSemApontamento: number | null; pctAtivosComApontamento: number | null;
    apontamentosNoRecorte: number; ativosComApontamentoNoStatus?: number; apontamentosNoStatus?: number };
  linhas: Array<CrossingRow & InventoryAsset>; statusEncontrados?: string[];
  pagina?: number; totalLinhas?: number; totalPaginas?: number;
}
export interface InventoryItems {
  itens: InventoryAsset[]; pagina: number; totalPaginas: number; totalItens: number;
}
export interface AssetReportings {
  apontamentos: Array<{ uuid: string; numero: string | null; classe: string | null; status: string | null; dataCriacao: string | null; dataExecucao: string | null; link: string | null }>;
  pagina: number; totalPaginas: number; totalApontamentos: number; catalogosCompletos: boolean; avisos: string[];
}
export interface InventoryProcessing { status: 'processando'; etapa: string; iniciadoEm: string; decorridoSeg: number; tentarNovamenteEmSeg: number }
export class InventoryRequestError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function requestInventory<T>(path: string, query: string, signal: AbortSignal) {
  const response = await fetch(`/api/kartado-inventory/${path}?${query}`, { credentials: 'same-origin', signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) throw new InventoryRequestError(payload?.error || 'Não foi possível consultar o inventário.', payload?.code || 'INVALID_RESPONSE', response.status);
  return { data: payload as T | InventoryProcessing, retryAfter: Math.min(300, Math.max(1, Number(response.headers.get('Retry-After')) || 15)) };
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Consulta interrompida', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
// O polling repete a mesma requisição e respeita Retry-After. O backend deduplica refresh.
export async function followInventory<T extends InventoryResult>(path: string, query: string, signal: AbortSignal, onResult: (value: T | InventoryProcessing) => void) {
  const started = Date.now();
  for (;;) {
    signal.throwIfAborted();
    const { data, retryAfter } = await requestInventory<T>(path, query, signal);
    signal.throwIfAborted();
    onResult(data);
    const ongoing = data.status === 'processando' || Object.values(data.coleta).some(source => source?.atualizacao.estado === 'em_andamento');
    if (!ongoing) return;
    if (Date.now() - started > 15 * 60_000) throw new InventoryRequestError('A coleta continua no servidor. Consulte novamente para acompanhar o resultado.', 'POLLING_TIMEOUT', 504);
    await wait(retryAfter * 1000, signal);
  }
}

// Uma instância pertence à página, nunca é persistida nem compartilhada entre sessões.
export class InventoryCache {
  private entries = new Map<string, { data: InventoryResult; savedAt: number; invalidated: boolean }>();
  private generations = new Map<string, number>();
  private jobs = new Map<string, { controller: AbortController; listeners: Set<(value: InventoryResult | InventoryProcessing) => void>; promise: Promise<void> }>();

  private key(path: string, query: string) {
    const params = new URLSearchParams(query);
    params.delete('refresh');
    params.sort();
    return `${path}?${params}`;
  }

  get<T extends InventoryResult>(path: string, query: string): T | null {
    const entry = this.entries.get(this.key(path, query));
    if (!entry) return null;
    const elapsed = Math.max(0, (Date.now() - entry.savedAt) / 1000);
    // Atualiza a idade exibida, sem alterar os metadados originais do cache.
    const data = { ...entry.data, coleta: Object.fromEntries(Object.entries(entry.data.coleta).map(([name, source]) => {
      if (!source) return [name, source];
      const idadeSeg = source.atualidade.idadeSeg + elapsed;
      return [name, { ...source, atualidade: { ...source.atualidade, idadeSeg, expirado: source.atualidade.expirado || idadeSeg >= source.atualidade.validadeSeg } }];
    })) };
    return data as T;
  }

  invalidate(company: string) {
    this.generations.set(company, (this.generations.get(company) || 0) + 1);
    for (const entry of this.entries.values()) if (entry.data.companyUuid === company) entry.invalidated = true;
  }

  async follow<T extends InventoryResult>(path: string, query: string, signal: AbortSignal, onResult: (value: T | InventoryProcessing) => void) {
    signal.throwIfAborted();
    const key = this.key(path, query);
    const cached = this.get<T>(path, query);
    const entry = this.entries.get(key);
    const force = new URLSearchParams(query).get('refresh') === '1';
    if (cached) onResult(cached);
    if (!force && cached && entry && !entry.invalidated && Date.now() - entry.savedAt < 60_000 && cached.coletaCompleta
      && Object.values(cached.coleta).every(source => !source || (!source.atualidade.expirado && source.atualizacao.estado === 'ociosa'))) return;

    // Refresh tem um trabalho separado para não ser absorvido por uma leitura anterior.
    const jobKey = `${key}${force ? '&refresh=1' : ''}`;
    let job = this.jobs.get(jobKey);
    if (!job) {
      const company = new URLSearchParams(query).get('concessao') || '';
      const generation = this.generations.get(company) || 0;
      const controller = new AbortController();
      const listeners = new Set<(value: InventoryResult | InventoryProcessing) => void>();
      const created = { controller, listeners, promise: Promise.resolve() };
      this.jobs.set(jobKey, created);
      created.promise = followInventory<InventoryResult>(path, query, controller.signal, value => {
        if (value.status === 'pronto' && generation === (this.generations.get(company) || 0)) {
          this.entries.delete(key);
          this.entries.set(key, { data: value, savedAt: Date.now(), invalidated: false });
          if (this.entries.size > 80) this.entries.delete(this.entries.keys().next().value!);
        }
        for (const listener of listeners) listener(value);
      }).finally(() => { if (this.jobs.get(jobKey) === created) this.jobs.delete(jobKey); });
      job = created;
    }
    const current = job;
    await new Promise<void>((resolve, reject) => {
      const listener = (value: InventoryResult | InventoryProcessing) => { if (!signal.aborted) onResult(value as T | InventoryProcessing); };
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        current.listeners.delete(listener);
        if (!current.listeners.size) {
          current.controller.abort();
          if (this.jobs.get(jobKey) === current) this.jobs.delete(jobKey);
        }
      };
      const abort = () => { cleanup(); reject(new DOMException('Consulta interrompida', 'AbortError')); };
      current.listeners.add(listener);
      signal.addEventListener('abort', abort, { once: true });
      current.promise.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
      if (signal.aborted) abort();
    });
  }
}
