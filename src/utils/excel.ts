import * as XLSX from 'xlsx';

const EXPECTED_HEADERS = [
  'Data',
  'Hora',
  'Computador',
  'Unidade',
  'TotalGB',
  'UsadoGB',
  'LivreGB',
  'PercentualUsado',
  'PercentualLivre',
];

const DISPLAY_HEADER_LABELS: Record<string, string> = {
  Data: 'Data',
  Hora: 'Hora',
  Computador: 'Computador',
  Unidade: 'Unidade',
  TotalGB: 'Capacidade Total',
  UsadoGB: 'Espaço Utilizado',
  LivreGB: 'Espaço Livre',
  PercentualUsado: 'Percentual Utilizado',
  PercentualLivre: 'Percentual Livre',
};

export function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

export function isValidHeader(value: string): boolean {
  const normalized = normalizeHeader(value);
  return normalized.length > 0 && !/^__EMPTY(?:_\d+)?$/i.test(normalized);
}

export function mapHeaders(headers: string[]): string[] {
  return headers.filter(isValidHeader).map(normalizeHeader);
}

export function hasMonitoringHeaders(headers: string[]): boolean {
  const normalized = new Set(mapHeaders(headers));
  return EXPECTED_HEADERS.every((header) => normalized.has(header));
}

export function getDisplayHeaderLabel(header: string): string {
  return DISPLAY_HEADER_LABELS[header] ?? header;
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return String(value);
}

export function parseSpreadsheetNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('pt-BR', options).format(value);
}

function formatExcelDate(value: number): string {
  const dateCode = XLSX.SSF.parse_date_code(value);

  if (!dateCode) {
    return formatNumber(value);
  }

  const date = new Date(dateCode.y, dateCode.m - 1, dateCode.d);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatExcelTime(value: number): string {
  const totalMinutes = Math.round(value * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatStorageValue(value: number): string {
  if (Math.abs(value) >= 1024) {
    return `${formatNumber(value / 1024, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TB`;
  }

  return `${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} GB`;
}

export function formatPreviewValue(header: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = parseSpreadsheetNumber(value);

  switch (header) {
    case 'Data':
      return numericValue !== null ? formatExcelDate(numericValue) : String(value);
    case 'Hora':
      return numericValue !== null ? formatExcelTime(numericValue) : String(value);
    case 'TotalGB':
    case 'UsadoGB':
    case 'LivreGB':
      return numericValue !== null ? formatStorageValue(numericValue) : String(value);
    case 'PercentualUsado':
    case 'PercentualLivre':
      return numericValue !== null
        ? `${formatNumber(numericValue * 100, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%`
        : String(value);
    default:
      return formatCellValue(value);
  }
}

export function formatGigabytesValue(value: number): string {
  return `${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} GB`;
}

export function normalizePercentageValue(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return value;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function formatPercentageValue(value: number): string {
  return `${formatNumber(normalizePercentageValue(value), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
