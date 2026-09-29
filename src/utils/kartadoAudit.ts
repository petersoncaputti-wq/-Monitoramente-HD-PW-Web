import type { AuditItem } from '../services/kartadoAuditService';

export type AuditFilters = { search: string; status: string; nature: string; road: string; section: string; from: string; to: string };
export const emptyAuditFilters: AuditFilters = { search: '', status: '', nature: '', road: '', section: '', from: '', to: '' };
function key(value: string | null) { return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR'); }
// Vocabulário explícito: status desconhecido não é presumido pendente ou encerrado.
export function auditStatus(item: AuditItem): 'pending' | 'completed' | 'other' {
  const status = key(item.status);
  if (['executado', 'concluido', 'encerrado', 'finalizado'].includes(status)) return 'completed';
  if (item.dataExecucao) return 'other';
  return ['identificado', 'em execucao', 'pendente', 'aberto', 'em andamento'].includes(status) ? 'pending' : 'other';
}
export function auditToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function auditOverdue(item: AuditItem, today = auditToday()) {
  return auditStatus(item) === 'pending' && /^\d{4}-\d{2}-\d{2}$/.test(item.dataVencimento || '') && item.dataVencimento! < today;
}
export function filterAuditItems(items: AuditItem[], filters: AuditFilters) {
  const search = key(filters.search);
  return items.filter(item => (!search || [item.numero, item.classe, item.natureza, item.rodovia].some(value => key(value).includes(search)))
    && (!filters.status || (item.status || 'Não informado') === filters.status)
    && (!filters.nature || (item.natureza || 'Não informada') === filters.nature)
    && (!filters.road || (item.rodovia || 'Não informada') === filters.road)
    && (!filters.section || (item.trecho || 'Não identificado') === filters.section)
    && (!filters.from || Boolean(item.dataCriacao && item.dataCriacao >= filters.from))
    && (!filters.to || Boolean(item.dataCriacao && item.dataCriacao <= filters.to)));
}
export function auditCounts(items: AuditItem[], today = auditToday()) {
  return items.reduce((counts, item) => {
    counts.total++;
    const status = auditStatus(item);
    counts[status]++;
    if (auditOverdue(item, today)) counts.overdue++;
    return counts;
  }, { total: 0, pending: 0, completed: 0, other: 0, overdue: 0 });
}
export function safeKartadoLink(value: string | null) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && url.hostname === 'app.kartado.com.br' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
