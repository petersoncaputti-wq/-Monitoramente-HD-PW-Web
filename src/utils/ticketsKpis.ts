import type { TicketRow } from '@/types/monitoring';
import { formatNumber } from '@/utils/excel';

const BUSINESS_WINDOWS = [
  { endHour: 12, startHour: 8 },
  { endHour: 17, startHour: 13 },
];

export interface TicketsSummary {
  totalTickets: number;
  attendedTickets: number;
  openTickets: number;
  openedInPeriod: number;
  closedInPeriod: number;
  pendingTickets: number;
  newTickets: number;
  queuedTickets: number;
  violatedSla: number;
  inSla: number;
  slaApplicableTickets: number;
  slaComplianceValue: number;
  slaCompliancePercentage: string;
  attendedPercentage: string;
  violatedSlaPercentage: string;
  averageResolutionHours: number | null;
  averageResolutionTime: string;
  medianResolutionTime: string;
  resolutionTimeBuckets: Array<{ label: string; count: number }>;
  selectedService: string;
  selectedServiceOpenTickets: number;
  topCategories: Array<{ label: string; count: number }>;
  topOrganizations: Array<{ label: string; count: number }>;
  topRequesterOrganizations: Array<{ label: string; count: number }>;
  topRequesters: Array<{ label: string; count: number }>;
  selectedServiceOpenByCompany: Array<{ label: string; count: number }>;
  selectedServiceTopRequesters: Array<{ label: string; count: number }>;
  pendingByPriority: Array<{ label: string; count: number }>;
  pendingAging: Array<{ label: string; count: number }>;
  statusBreakdown: Array<{ label: string; count: number }>;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeComparable(value: unknown): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const TICKET_FIELDS = {
  beneficiaryOrganization: ['Organiza\u00e7\u00e3odobenefici\u00e1rio'],
  category: ['Categoriza\u00e7\u00e3o'],
  requesterOrganization: ['Organiza\u00e7\u00e3odosolicitante'],
};

function getRowValue(row: TicketRow, keys: keyof TicketRow | string[]): unknown {
  if (!Array.isArray(keys)) {
    return row[keys];
  }

  for (const key of keys) {
    const value = row[key];

    if (normalizeText(value)) {
      return value;
    }
  }

  const normalizedKeys = keys.map(normalizeComparable);
  const matchedEntry = Object.entries(row).find(([key, value]) => {
    return normalizeText(value) && normalizedKeys.includes(normalizeComparable(key));
  });

  return matchedEntry?.[1];
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

function isClosedStatus(status: unknown): boolean {
  const normalized = normalizeComparable(status);
  return normalized === 'fechado' || normalized === 'resolvido';
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function setTime(date: Date, hour: number): Date {
  const result = new Date(date);
  result.setHours(hour, 0, 0, 0);
  return result;
}

function getBusinessHoursBetween(start: Date, end: Date): number {
  if (end <= start) {
    return 0;
  }

  let totalMilliseconds = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    if (isBusinessDay(cursor)) {
      for (const window of BUSINESS_WINDOWS) {
        const windowStart = setTime(cursor, window.startHour);
        const windowEnd = setTime(cursor, window.endHour);
        const effectiveStart = start > windowStart ? start : windowStart;
        const effectiveEnd = end < windowEnd ? end : windowEnd;

        if (effectiveEnd > effectiveStart) {
          totalMilliseconds += effectiveEnd.getTime() - effectiveStart.getTime();
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMilliseconds / 3600000;
}

function parseTicketDate(value: unknown): Date | null {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) {
    return null;
  }

  const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseInputDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(date: Date | null, startDateValue: string, endDateValue: string) {
  if (!date) {
    return false;
  }

  const startDate = parseInputDate(startDateValue);
  const endDate = parseInputDate(endDateValue);

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

function countBy(rows: TicketRow[], key: keyof TicketRow | string[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const label = normalizeText(getRowValue(row, key)) || '-';
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countAging(rows: TicketRow[]) {
  const now = new Date();
  const buckets = new Map([
    ['0-2 dias', 0],
    ['3-5 dias', 0],
    ['6-10 dias', 0],
    ['10+ dias', 0],
  ]);

  for (const row of rows) {
    const openedAt = parseTicketDate(row.Abertoem);
    const daysOpen = openedAt
      ? Math.max(0, Math.floor((now.getTime() - openedAt.getTime()) / 86400000))
      : 0;
    const label =
      daysOpen <= 2
        ? '0-2 dias'
        : daysOpen <= 5
          ? '3-5 dias'
          : daysOpen <= 10
            ? '6-10 dias'
            : '10+ dias';

    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([label, count]) => ({ label, count }));
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds <= 0) {
    return '-';
  }

  const hours = milliseconds / 3600000;
  return `${formatNumber(hours, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

function getMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
  }

  return sortedValues[middle];
}

function countResolutionTimeBuckets(durations: number[]) {
  const buckets = new Map([
    ['0-8h', 0],
    ['8-24h', 0],
    ['1-3 dias', 0],
    ['3+ dias', 0],
  ]);

  for (const duration of durations) {
    const hours = duration / 3600000;
    const label =
      hours <= 8 ? '0-8h' : hours <= 24 ? '8-24h' : hours <= 72 ? '1-3 dias' : '3+ dias';

    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([label, count]) => ({ label, count }));
}

export function getTicketDateRange(rows: TicketRow[]) {
  const validDates = rows
    .flatMap((row) => [parseTicketDate(row.Abertoem), parseTicketDate(row.Atualizado)])
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (validDates.length === 0) {
    return null;
  }

  return {
    minDate: formatInputDate(validDates[0]),
    maxDate: formatInputDate(validDates[validDates.length - 1]),
  };
}

export function getTicketServices(rows: TicketRow[]): string[] {
  return countBy(rows, TICKET_FIELDS.category)
    .map((item) => item.label)
    .filter((label) => label !== '-');
}

export function getTicketsSummary(
  rows: TicketRow[],
  options: { startDate?: string; endDate?: string; selectedService?: string } = {},
): TicketsSummary {
  const { endDate = '', selectedService = '', startDate = '' } = options;
  const totalTickets = rows.length;
  const attendedTickets = rows.filter((row) => isClosedStatus(row.Status)).length;
  const newTickets = rows.filter((row) => normalizeText(row.Status) === 'Novo').length;
  const queuedTickets = rows.filter((row) => normalizeText(row.Status) === 'Na fila').length;
  const openTickets = totalTickets - attendedTickets;
  const openedRows = rows.filter((row) =>
    isDateInRange(parseTicketDate(row.Abertoem), startDate, endDate),
  );
  const closedRows = rows.filter(
    (row) =>
      isClosedStatus(row.Status) &&
      isDateInRange(parseTicketDate(row.Atualizado), startDate, endDate),
  );
  const pendingRows = rows.filter((row) => {
    if (isClosedStatus(row.Status)) {
      return false;
    }

    if (!startDate && !endDate) {
      return true;
    }

    return isDateInRange(parseTicketDate(row.Abertoem), startDate, endDate);
  });
  const slaRows = closedRows.filter(
    (row) => !normalizeComparable(row.StatusdoSLA).includes('nao aplicado'),
  );
  const slaApplicableTickets = slaRows.length;
  const inSla = slaRows.filter((row) => normalizeText(row.StatusdoSLA) === 'No SLA').length;
  const violatedSla = slaApplicableTickets - inSla;
  const resolutionDurations = closedRows
    .map((row) => {
      const openedAt = parseTicketDate(row.Abertoem);
      const updatedAt = parseTicketDate(row.Atualizado);

      if (!openedAt || !updatedAt || updatedAt < openedAt) {
        return null;
      }

      return getBusinessHoursBetween(openedAt, updatedAt) * 3600000;
    })
    .filter((value): value is number => typeof value === 'number');
  const averageResolution =
    resolutionDurations.length > 0
      ? resolutionDurations.reduce((total, value) => total + value, 0) /
        resolutionDurations.length
      : null;
  const averageResolutionHours =
    averageResolution === null ? null : averageResolution / 3600000;
  const medianResolution = getMedian(resolutionDurations);
  const selectedServiceRows =
    selectedService && selectedService !== 'Todos os servicos'
      ? openedRows.filter((row) => normalizeText(getRowValue(row, TICKET_FIELDS.category)) === selectedService)
      : openedRows;

  return {
    totalTickets,
    attendedTickets,
    openTickets,
    openedInPeriod: openedRows.length,
    closedInPeriod: closedRows.length,
    pendingTickets: pendingRows.length,
    newTickets,
    queuedTickets,
    violatedSla,
    inSla,
    slaApplicableTickets,
    slaComplianceValue: slaApplicableTickets === 0 ? 0 : (inSla / slaApplicableTickets) * 100,
    slaCompliancePercentage: formatPercentage(inSla, slaApplicableTickets),
    attendedPercentage: formatPercentage(attendedTickets, totalTickets),
    violatedSlaPercentage: formatPercentage(violatedSla, openedRows.length),
    averageResolutionHours,
    averageResolutionTime:
      averageResolutionHours === null ? '-' : `${formatNumber(averageResolutionHours, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} h`,
    medianResolutionTime: formatDuration(medianResolution),
    resolutionTimeBuckets: countResolutionTimeBuckets(resolutionDurations),
    selectedService: selectedService || 'Todos os servicos',
    selectedServiceOpenTickets: selectedServiceRows.length,
    topCategories: countBy(rows, TICKET_FIELDS.category),
    topOrganizations: countBy(rows, TICKET_FIELDS.beneficiaryOrganization),
    topRequesterOrganizations: countBy(rows, TICKET_FIELDS.requesterOrganization),
    topRequesters: countBy(openedRows, 'Solicitante'),
    selectedServiceOpenByCompany: countBy(selectedServiceRows, TICKET_FIELDS.beneficiaryOrganization),
    selectedServiceTopRequesters: countBy(selectedServiceRows, 'Solicitante'),
    pendingByPriority: countBy(pendingRows, 'Prioridade'),
    pendingAging: countAging(pendingRows),
    statusBreakdown: countBy(rows, 'Status'),
  };
}

export function formatTicketDate(value: unknown): string {
  const date = parseTicketDate(value);

  if (!date) {
    return normalizeText(value) || '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
