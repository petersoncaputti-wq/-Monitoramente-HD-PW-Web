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
