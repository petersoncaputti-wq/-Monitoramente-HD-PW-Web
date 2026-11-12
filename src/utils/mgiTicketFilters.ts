import type { TicketRow } from '@/types/monitoring';

export const mgiFilterFields = [
  { key: 'Status', label: 'Status' },
  { key: 'Grupoatribuído', label: 'Grupo atribuído' },
  { key: 'Prioridade', label: 'Prioridade' },
  { key: 'Organizaçãodosolicitante', label: 'Organização do solicitante' },
  { key: 'Origem', label: 'Origem', advanced: true },
  { key: 'AgenteAtribuído', label: 'Resolvido por', advanced: true },
] as const;

export interface MgiTicketFilters {
  values: Record<string, string[]>;
  resolutionStart: string;
  resolutionEnd: string;
}

export const emptyMgiFilters = (): MgiTicketFilters => ({ values: {}, resolutionStart: '', resolutionEnd: '' });
export const ticketFilterValue = (value: unknown) => String(value ?? '').trim();

export function filterMgiTickets(rows: TicketRow[], filters: MgiTicketFilters, creationStart = '', creationEnd = '') {
  return rows.filter(row => {
    const created = row.Abertoem?.slice(0, 10) ?? '';
    if ((creationStart || creationEnd) && (!created || (creationStart && created < creationStart) || (creationEnd && created > creationEnd))) return false;
    const resolved = row.Fechadoem?.slice(0, 10) ?? '';
    if ((filters.resolutionStart || filters.resolutionEnd) && (!resolved || (filters.resolutionStart && resolved < filters.resolutionStart) || (filters.resolutionEnd && resolved > filters.resolutionEnd))) return false;
    return Object.entries(filters.values).every(([key, selected]) => !selected.length || selected.includes(ticketFilterValue(row[key])));
  });
}
