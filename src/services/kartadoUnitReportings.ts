import type { AuditItem } from './kartadoAuditService';

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const date = (value: unknown) => text(value)?.slice(0, 10) || null;
export function normalizeUnitReporting(row: Row): AuditItem {
  const section = text(row.trecho)?.trim();
  return {
    uuid: text(row.id || row.uuid) || '', numero: text(row.number), origem: text(row.origin),
    natureza: text(row.natureza), classe: text(row.classe || row.occurrenceType),
    trecho: section?.toLowerCase() === 'norte' ? 'Norte' : section?.toLowerCase() === 'sul' ? 'Sul' : 'Não identificado',
    status: text(row.status), rodovia: text(row.roadName),
    km: row.km != null && Number.isFinite(Number(row.km)) ? Number(row.km) : null,
    kmFinal: row.endKm != null && Number.isFinite(Number(row.endKm)) ? Number(row.endKm) : null,
    sentido: text(row.sentido), faixa: text(row.faixa), latitude: null, longitude: null,
    dataCriacao: date(row.createdAt), dataExecucao: date(row.executedAt), dataVencimento: date(row.prazo), link: text(row.link),
  };
}
export async function loadUnitReportingPage(company: string, page: number, signal: AbortSignal) {
  const response = await fetch('/api/v1/kartado/reportings/page', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyUuid: company, page }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha ao carregar apontamentos.');
  if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.pages) || data.pages < 1) throw new Error('Paginação inválida na resposta do Kartado.');
  const items = data.items.map(normalizeUnitReporting) as AuditItem[];
  if (items.some(item => !item.uuid)) throw new Error('A API retornou apontamentos sem identificação.');
  return { items, total: data.total as number, pages: data.pages as number };
}
