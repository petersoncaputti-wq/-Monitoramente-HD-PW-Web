export interface MapReporting {
  uuid: string; numero: string | null; rodovia: string | null; km: number | null; encontradoEm: string;
  classe: string; status: string; coordinates: [number, number] | null;
}
export interface MapResult { items: MapReporting[]; classes: string[]; total: number; partial: boolean; warnings: string[]; pages: number; processed: number }
export type MapCache = Map<string, { at: number; result: MapResult }>;
interface MapPage { success: boolean; company: string; items: MapReporting[]; classes?: string[]; total: number; paginas: number; pagina: number; avisos: string[] }
export function mapClassOptions(result: Pick<MapResult, 'items'> & { classes?: string[] } | null) {
  return [...new Set([...(result?.classes || []), ...(result?.items || []).map(item => item.classe)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
export function normalizeMapClass(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}
export function matchesMapClass(value: string, selected: string) {
  return !selected || normalizeMapClass(value) === normalizeMapClass(selected);
}
export function searchMapClasses(options: string[], search: string) {
  const terms = normalizeMapClass(search).split(' ').filter(Boolean);
  return options.filter(option => terms.every(term => normalizeMapClass(option).includes(term)));
}
export function mapStatus(status: string): 'completed' | 'progress' | 'pending' | 'other' {
  const key = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (['executado', 'concluido', 'encerrado', 'finalizado'].includes(key)) return 'completed';
  if (['em execucao', 'em andamento'].includes(key)) return 'progress';
  if (['aberto', 'identificado', 'pendente', 'programado'].includes(key)) return 'pending';
  return 'other';
}
export function heatMapItems(items: MapReporting[], pendingOnly = false) {
  return items.filter(item => {
    const point = item.coordinates;
    return point && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85.05112878
      && (!pendingOnly || ['pending', 'progress'].includes(mapStatus(item.status)));
  });
}
export function nearbyMapItems(items: MapReporting[], center: { x: number; y: number }, project: (point: [number, number]) => { x: number; y: number }, radius = 40) {
  return items.filter(item => item.coordinates).map(item => {
    const point = project(item.coordinates!);
    return { item, distance: (point.x - center.x) ** 2 + (point.y - center.y) ** 2 };
  }).filter(value => value.distance <= radius ** 2).sort((a, b) => a.distance - b.distance).map(value => value.item);
}
export function initialMapDates() {
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const from = new Date(`${to}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}
export async function requestMapPage(company: string, from: string, to: string, page: number, signal: AbortSignal): Promise<MapPage> {
  const query = new URLSearchParams({ company, from, to, page: String(page) });
  const response = await fetch(`/api/kartado-reporting-map?${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store', signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) throw new Error(data?.error || 'Não foi possível carregar os pontos do mapa.');
  if (data.company !== company || data.pagina !== page || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.paginas) || data.paginas < 1) throw new Error('Resposta inválida na consulta dos pontos.');
  return data;
}
export async function loadMapReportings(company: string, from: string, to: string, signal: AbortSignal, onProgress: (result: MapResult) => void,
  read = requestMapPage): Promise<MapResult> {
  const first = await read(company, from, to, 1, signal);
  signal.throwIfAborted();
  const items = new Map<string, MapReporting>();
  const warnings = new Set<string>();
  const classes = new Set<string>();
  let processed = 0, partial = first.paginas > 100;
  if (partial) warnings.add('Limite de 100 páginas atingido. Reduza o período para consultar os demais registros.');
  const accept = (page: MapPage) => {
    if (page.total !== first.total || page.paginas !== first.paginas) { partial = true; warnings.add('O total da origem mudou durante a consulta. Atualize o mapa.'); }
    for (const item of page.items) {
      if (items.has(item.uuid)) { partial = true; warnings.add('A origem retornou registros repetidos entre páginas.'); }
      items.set(item.uuid, item);
    }
    for (const warning of page.avisos || []) warnings.add(warning);
    for (const name of page.classes || []) if (typeof name === 'string' && name.trim()) classes.add(name);
    processed++;
  };
  const result = (): MapResult => ({ items: [...items.values()], classes: [...classes], total: first.total, partial, warnings: [...warnings], pages: first.paginas, processed });
  accept(first); onProgress(result());
  for (let start = 2; start <= Math.min(100, first.paginas); start += 3) {
    signal.throwIfAborted();
    const pages = Array.from({ length: Math.min(3, Math.min(100, first.paginas) - start + 1) }, (_, index) => start + index);
    const batch = await Promise.allSettled(pages.map(page => read(company, from, to, page, signal)));
    signal.throwIfAborted();
    batch.forEach((response, index) => {
      if (response.status === 'fulfilled') accept(response.value);
      else { partial = true; warnings.add(`Falha na página ${pages[index]}. Atualize o mapa para tentar novamente.`); }
    });
    onProgress(result());
  }
  if (items.size !== first.total) partial = true;
  return result();
}
