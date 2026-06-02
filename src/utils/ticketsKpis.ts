import type { TicketRow } from '@/types/monitoring';
import { formatNumber } from '@/utils/excel';

export interface TicketsSummary {
  totalTickets: number;
  attendedTickets: number;
  openTickets: number;
  newTickets: number;
  queuedTickets: number;
  violatedSla: number;
  inSla: number;
  attendedPercentage: string;
  violatedSlaPercentage: string;
  topCategories: Array<{ label: string; count: number }>;
  topOrganizations: Array<{ label: string; count: number }>;
  statusBreakdown: Array<{ label: string; count: number }>;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function formatPercentage(count: number, total: number): string {
  if (total === 0) {
    return '0,0%';
  }

  return `${formatNumber((count / total) * 100, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function countBy(rows: TicketRow[], key: keyof TicketRow) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const label = normalizeText(row[key]) || '-';
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function getTicketsSummary(rows: TicketRow[]): TicketsSummary {
  const totalTickets = rows.length;
  const attendedTickets = rows.filter((row) => {
    const status = normalizeText(row.Status);
    return status === 'Fechado' || status === 'Resolvido';
  }).length;
  const newTickets = rows.filter((row) => normalizeText(row.Status) === 'Novo').length;
  const queuedTickets = rows.filter((row) => normalizeText(row.Status) === 'Na fila').length;
  const openTickets = totalTickets - attendedTickets;
  const violatedSla = rows.filter((row) =>
    normalizeText(row.StatusdoSLA).toLowerCase().includes('violado'),
  ).length;
  const inSla = rows.filter((row) => normalizeText(row.StatusdoSLA) === 'No SLA').length;

  return {
    totalTickets,
    attendedTickets,
    openTickets,
    newTickets,
    queuedTickets,
    violatedSla,
    inSla,
    attendedPercentage: formatPercentage(attendedTickets, totalTickets),
    violatedSlaPercentage: formatPercentage(violatedSla, totalTickets),
    topCategories: countBy(rows, 'Categorização'),
    topOrganizations: countBy(rows, 'Organizaçãodobeneficiário'),
    statusBreakdown: countBy(rows, 'Status'),
  };
}

export function formatTicketDate(value: unknown): string {
  const text = normalizeText(value);

  if (!text) {
    return '-';
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
