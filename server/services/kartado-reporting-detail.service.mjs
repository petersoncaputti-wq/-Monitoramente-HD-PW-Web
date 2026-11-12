import { apiFetchBasic } from './kartado.service.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = value => typeof value === 'string' && UUID.test(value);
const idOf = resource => resource?.id || resource?.attributes?.uuid;
const attrs = resource => resource?.attributes || {};
const relId = (resource, key) => resource?.relationships?.[key]?.data?.id;
const text = value => value == null ? null : String(value);
const https = value => { try { return typeof value === 'string' && new URL(value).protocol === 'https:' ? value : null; } catch { return null; } };
export class ReportingDetailError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function rows(payload) {
  const items = payload?.data?.results || payload?.data || payload?.results;
  if (!Array.isArray(items)) throw new ReportingDetailError('A API retornou uma ficha em formato inválido.');
  return items;
}
function display(value, definition) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  const options = definition?.selectOptions?.options || [];
  if (Array.isArray(value)) return value.map(item => display(item, definition)).filter(Boolean).join('; ');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${display(item) ?? 'Não informado'}`).join(' · ');
  return text(options.find(option => String(option.value) === String(value))?.name ?? value);
}
export function formRows(data = {}, schema = {}, metadata = {}) {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const definitions = new Map(fields.filter(f => typeof f.apiName === 'string').map(f => [f.apiName, f]));
  const keys = [...new Set([...definitions.keys(), ...Object.keys(data)])];
  return keys.filter(key => data[key] != null && data[key] !== '').map(key => {
    const field = definitions.get(key);
    return { key, label: field?.displayName || key.replace(/([a-z])([A-Z])/g, '$1 $2'), value: display(data[key], field),
      type: field?.dataType || 'string', manual: metadata[key]?.manuallySpecified === true };
  });
}

export function createReportingDetailClient({ read = apiFetchBasic } = {}) {
  return {
    async get(company, uuid) {
      if (!validUuid(company) || !validUuid(uuid)) throw new ReportingDetailError('Unidade ou apontamento inválido.', 400);
      const warnings = [];
      const list = async (kind, params) => rows(await read(`/${kind}/`, { company, page: '1', page_size: '1', ...params }));
      const lookup = async (kind, id) => {
        if (!id) return null;
        const items = await list(kind, { uuid: id });
        const item = items.find(resource => idOf(resource) === id);
        if (!item) throw new ReportingDetailError('O recurso vinculado não foi localizado.');
        return item;
      };
      let record;
      try { record = await lookup('Reporting', uuid); }
      catch (error) {
        const status = error.httpStatus;
        if (status === 401 || status === 403) throw new ReportingDetailError('A conta da integração não tem acesso a este apontamento.', 403);
        if (status === 404) throw new ReportingDetailError('Apontamento não encontrado.', 404);
        if (error instanceof ReportingDetailError) throw error;
        throw new ReportingDetailError('Não foi possível consultar a ficha do apontamento.');
      }
      if (!record || relId(record, 'company') !== company) throw new ReportingDetailError('O apontamento não pertence à unidade selecionada.', 404);
      const optional = async (label, kind, id) => {
        try { return await lookup(kind, id); }
        catch { warnings.push(`Não foi possível consultar ${label}.`); return null; }
      };
      const [co, firm, occurrence, status, inventory, approval] = await Promise.all([
        optional('os dados da unidade', 'Company', company),
        optional('a equipe', 'Firm', relId(record, 'firm')),
        optional('a classe e o formulário', 'OccurrenceType', relId(record, 'occurrenceType')),
        optional('o status', 'ServiceOrderActionStatus', relId(record, 'status')),
        optional('o inventário vinculado', 'Inventory', relId(record, 'parent')),
        optional('a aprovação', 'ApprovalStep', relId(record, 'approvalStep')),
      ]);
      const a = attrs(record), companyData = attrs(co), inventoryData = attrs(inventory);
      const companyFields = companyData.customOptions?.reporting?.fields || {};
      const invFields = companyData.customOptions?.inventory?.fields || companyFields;
      const location = (values, definitions) => ({
        rodovia: text(values.roadName), km: values.km ?? null, kmFinal: values.endKm ?? null,
        sentido: display(values.direction, definitions.direction), faixa: display(values.lane, definitions.lane),
        lote: display(values.lot, definitions.lot), municipio: text(values.city),
        coordinates: values.point?.type === 'Point' && Array.isArray(values.point.coordinates)
          && values.point.coordinates.length >= 2 && values.point.coordinates.slice(0, 2).every(Number.isFinite)
          && Math.abs(values.point.coordinates[0]) <= 180 && Math.abs(values.point.coordinates[1]) <= 90 ? values.point.coordinates.slice(0, 2) : null,
      });
      let linkedClass = null;
      if (inventory) linkedClass = await optional('a classe do inventário', 'OccurrenceType', relId(inventory, 'occurrenceType'));
      return { success: true, uuid, companyUuid: company, numero: text(a.number), unidade: text(companyData.name),
        equipe: text(attrs(firm).name), classe: text(attrs(occurrence).name), status: text(attrs(status).name), aprovacao: text(attrs(approval).name),
        natureza: display(a.occurrenceKind, companyFields.occurrenceKind), encontradoEm: text(a.foundAt), criadoEm: text(a.createdAt),
        executadoEm: text(a.executedAt), prazo: text(a.dueAt), atualizadoEm: text(a.updatedAt),
        localizacao: location(a, companyFields), campos: formRows(a.formData, attrs(occurrence).formFields, a.formMetadata),
        inventario: inventory ? { uuid: idOf(inventory), numero: text(inventoryData.number), classe: text(attrs(linkedClass).name),
          encontradoEm: text(inventoryData.foundAt), ...location(inventoryData, invFields) } : null,
        totalArquivos: a.fileCount ?? record.relationships?.reportingFiles?.meta?.count ?? 0, avisos: warnings };
    },
    async files(company, uuid, page = 1) {
      // Confere o vínculo à unidade antes de buscar arquivos, inclusive em acesso direto.
      if (!validUuid(company) || !validUuid(uuid) || !Number.isInteger(page) || page < 1 || page > 10000) throw new ReportingDetailError('Consulta de arquivos inválida.', 400);
      const record = rows(await read('/Reporting/', { company, uuid, page: '1', page_size: '1' })).find(item => idOf(item) === uuid);
      if (!record || relId(record, 'company') !== company) throw new ReportingDetailError('Apontamento não encontrado nesta unidade.', 404);
      const payload = await read('/ReportingFile/', { company, reporting: uuid, page: String(page), page_size: '20' });
      const items = rows(payload);
      if (items.some(file => relId(file, 'reporting') !== uuid)) throw new ReportingDetailError('A API retornou arquivos de outro apontamento.');
      const total = payload.meta?.pagination?.count ?? payload.data?.meta?.pagination?.count ?? items.length;
      if (!Number.isSafeInteger(total) || total < items.length) throw new ReportingDetailError('A API retornou uma paginação de arquivos inválida.');
      return { success: true, pagina: page, total, totalPaginas: Math.max(1, Math.ceil(total / 20)), arquivos: items.map(file => {
        const a = attrs(file);
        return { uuid: idOf(file), descricao: text(a.description), url: https(a.upload) || https(a.uploadUrl), imagem: a.uploadExt === 'IMAGE',
          tipo: text(a.kind), data: text(a.datetime || a.uploadedAt) };
      }) };
    },
  };
}
