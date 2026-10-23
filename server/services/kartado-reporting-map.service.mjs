import { apiFetchBasic } from './kartado.service.mjs';
import { ReportingDetailError } from './kartado-reporting-detail.service.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function rows(payload) {
  const items = payload?.data?.results || payload?.data;
  if (!Array.isArray(items)) throw new ReportingDetailError('Resposta inválida na consulta do mapa.');
  return items;
}
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function mapParams(query) {
  const { company, from, to } = query;
  const page = query.page || '1';
  if (typeof company !== 'string' || !UUID.test(company) || !validDate(from) || !validDate(to)
    || from > to || Date.parse(to) - Date.parse(from) > 365 * 86400000
    || typeof page !== 'string' || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100) {
    throw new ReportingDetailError('Informe unidade, período de até 366 dias e página válidos.', 400);
  }
  return { company, from, to, page: Number(page) };
}

export function createReportingMapClient({ read = apiFetchBasic } = {}) {
  const catalogs = new Map();
  async function catalog(company) {
    const saved = catalogs.get(company);
    if (saved && saved.expires > Date.now()) return saved.promise;
    const promise = Promise.all(['OccurrenceType', 'ServiceOrderActionStatus'].map(async kind => {
      const names = new Map();
      try {
        let expected = 0, pages = 1, partial = false;
        for (let page = 1; page <= Math.min(pages, 20); page++) {
          const payload = await read(`/${kind}/`, { company, page: String(page), page_size: '1000', [`fields[${kind}]`]: 'uuid,name' });
          const items = rows(payload);
          const meta = payload.meta?.pagination || payload.data?.meta?.pagination;
          if (page === 1) {
            expected = meta?.count ?? items.length;
            pages = Math.max(1, meta?.pages ?? Math.ceil(expected / Math.max(1, items.length)));
            if (!Number.isSafeInteger(expected) || expected < items.length || !Number.isSafeInteger(pages)) throw new Error('Catálogo inválido');
          } else if (meta && (meta.count !== expected || Math.max(1, meta.pages) !== pages)) partial = true;
          for (const item of items) {
            if (typeof item.id === 'string' && typeof item.attributes?.name === 'string' && item.attributes.name.trim()) names.set(item.id, item.attributes.name.trim());
            else partial = true;
          }
        }
        return { names, partial: partial || pages > 20 || names.size < expected };
      } catch { return { names, partial: true }; }
    }));
    catalogs.set(company, { expires: Date.now() + 300000, promise });
    if (catalogs.size > 20) catalogs.delete(catalogs.keys().next().value);
    return promise;
  }
  return {
    async page(query) {
      const params = mapParams(query);
      const [payload, [classes, statuses]] = await Promise.all([
        read('/Reporting/', { company: params.company, page: String(params.page), page_size: '200',
          found_at_after: params.from, found_at_before: params.to, ordering: 'uuid',
          'fields[Reporting]': 'uuid,number,point,road_name,km,found_at,status,occurrence_type,company' }),
        catalog(params.company),
      ]);
      const items = rows(payload);
      const meta = payload.meta?.pagination || payload.data?.meta?.pagination;
      if (!Number.isSafeInteger(meta?.count) || meta.count < items.length || !Number.isSafeInteger(meta.pages) || meta.pages < 0) throw new ReportingDetailError('Paginação inválida na consulta do mapa.');
      const points = items.map(item => {
        const a = item.attributes || {};
        if (!UUID.test(item.id || '') || item.relationships?.company?.data?.id !== params.company) throw new ReportingDetailError('O mapa recebeu um registro de outra unidade ou sem identificação.');
        const found = typeof a.foundAt === 'string' ? a.foundAt.slice(0, 10) : null;
        if (!found || found < params.from || found > params.to) throw new ReportingDetailError('A origem retornou registros fora do período solicitado.');
        const point = a.point?.type === 'Point' ? a.point.coordinates : null;
        const valid = Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85.05112878;
        return { uuid: item.id, numero: a.number || null, rodovia: a.roadName || null, km: a.km ?? null, encontradoEm: found,
          classe: classes.names.get(item.relationships?.occurrenceType?.data?.id) || 'Classe não identificada',
          status: statuses.names.get(item.relationships?.status?.data?.id) || 'Status não identificado',
          coordinates: valid ? point.slice(0, 2) : null };
      });
      return { success: true, company: params.company, pagina: params.page, total: meta.count, paginas: Math.max(1, meta.pages),
        classes: params.page === 1 ? [...new Set(classes.names.values())].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [],
        items: points, avisos: classes.partial || statuses.partial ? ['Alguns nomes de classe ou status não puderam ser resolvidos.'] : [] };
    },
  };
}
