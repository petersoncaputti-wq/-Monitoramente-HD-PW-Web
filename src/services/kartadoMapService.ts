// Mapa de apontamentos da unidade. Os dados vêm da base do mapa no servidor
// (cópia do Kartado recoletada todo dia às 04:00), já filtrados e agregados.
export interface MapReporting {
  uuid: string;
  numero: string | null;
  rodovia: string | null;
  km: number | null;
  encontradoEm: string | null;
  classe: string;
  status: string;
  coordinates: [number, number] | null;
}
export interface MapFilters {
  from: string;
  to: string;
  status: string;
  classe: string;
  rodovia: string;
}
export interface MapSync {
  estado: 'aguardando' | 'em_andamento' | 'ociosa' | 'incompleta' | 'falhou';
  atualizadoEm: string | null;
  proximaEm: string | null;
  paginas: number;
  paginasTotal: number;
  erro: string | null;
}
/** [latitude, longitude, apontamentos, pendências] de uma célula de ~11 m. */
export type MapCell = [number, number, number, number];
export interface MapSummary {
  coleta: MapSync;
  total: number;
  mapped: number;
  cells: MapCell[];
  options: { status: string[]; classes: string[]; rodovias: string[] };
}
export interface MapPoints {
  total: number;
  items: MapReporting[];
}
export interface MapList extends MapPoints {
  pages: number;
}
export type MapBounds = { west: number; south: number; east: number; north: number };
export const MAP_POINTS_LIMIT = 3000;

function mapQuery(company: string, filters: MapFilters, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ company });
  for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value) query.set(key, value);
  return query;
}
async function request<T>(path: string, query: URLSearchParams, signal?: AbortSignal, method = 'GET'): Promise<T> {
  const response = await fetch(`/api/kartado-reporting-map/${path}?${query}`, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) throw new Error(data?.error || 'Não foi possível carregar o mapa.');
  return data as T;
}
const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;

export async function fetchMapSummary(company: string, filters: MapFilters, signal?: AbortSignal) {
  const data = await request<MapSummary>('resumo', mapQuery(company, filters), signal);
  if (!isCount(data.total) || !isCount(data.mapped) || !Array.isArray(data.cells) || !data.coleta || !data.options)
    throw new Error('Resposta inválida da base do mapa.');
  return data;
}
export async function fetchMapPoints(
  company: string,
  filters: MapFilters,
  bounds: MapBounds,
  options: { pendingOnly?: boolean; limit?: number; center?: { lat: number; lon: number } } = {},
  signal?: AbortSignal,
) {
  const extra: Record<string, string> = {
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => value.toFixed(6)).join(','),
    limit: String(options.limit ?? MAP_POINTS_LIMIT),
  };
  if (options.pendingOnly) extra.pendentes = '1';
  if (options.center) {
    extra.lat = options.center.lat.toFixed(6);
    extra.lon = options.center.lon.toFixed(6);
  }
  const data = await request<MapPoints>('pontos', mapQuery(company, filters, extra), signal);
  if (!isCount(data.total) || !Array.isArray(data.items)) throw new Error('Resposta inválida da base do mapa.');
  return data;
}
export async function fetchMapList(company: string, filters: MapFilters, page: number, signal?: AbortSignal) {
  const data = await request<MapList>('lista', mapQuery(company, filters, { page: String(page) }), signal);
  if (!isCount(data.total) || !isCount(data.pages) || !Array.isArray(data.items))
    throw new Error('Resposta inválida da base do mapa.');
  return data;
}
export async function requestMapRefresh(company: string) {
  return request<{ aceito: boolean; coleta: MapSync }>(
    'atualizar',
    new URLSearchParams({ company }),
    undefined,
    'POST',
  );
}

export function normalizeMapClass(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}
export function searchMapClasses(options: string[], search: string) {
  const terms = normalizeMapClass(search).split(' ').filter(Boolean);
  return options.filter((option) => terms.every((term) => normalizeMapClass(option).includes(term)));
}
export function mapStatus(status: string): 'completed' | 'progress' | 'pending' | 'other' {
  const key = status.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (['executado', 'concluido', 'encerrado', 'finalizado'].includes(key)) return 'completed';
  if (['em execucao', 'em andamento'].includes(key)) return 'progress';
  if (['aberto', 'identificado', 'pendente', 'programado'].includes(key)) return 'pending';
  return 'other';
}
/** Células com peso para o calor: todos os apontamentos ou só as pendências. */
export function heatCells(cells: MapCell[], pendingOnly = false): [number, number, number][] {
  return cells
    .map(([lat, lon, total, pending]): [number, number, number] => [lat, lon, pendingOnly ? pending : total])
    .filter(([lat, lon, weight]) => weight > 0 && Math.abs(lat) <= 85.05112878 && Math.abs(lon) <= 180);
}
export function initialMapDates() {
  const to = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}
