// Leitura e validação do CSV diário de armazenamento (coletor PowerShell).
// Extraído de api/storage-import.mjs (handler antigo do Supabase/Vercel).
import { createHash } from 'node:crypto';

const REQUIRED_HEADERS = [
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

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseDate(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    const brMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (brMatch) {
      const [, day, month, year] = brMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }

    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }

  return null;
}

function parseTime(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);

    if (hours > 23 || minutes > 59 || seconds > 59) {
      return null;
    }

    return { hours, minutes, seconds };
  }

  return null;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function readCsvRows(content) {
  const normalizedContent = String(content ?? '').replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? '').map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(time) {
  return [time.hours, time.minutes, time.seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function toObservedAt(date, time) {
  const observedAt = new Date(date);
  observedAt.setUTCHours(time.hours, time.minutes, time.seconds, 0);
  return observedAt.toISOString();
}

export function getContentHash(content) {
  return createHash('sha256')
    .update(String(content ?? ''))
    .digest('hex');
}

export function parseStorageCsv(content) {
  const rows = readCsvRows(content);
  const headers = new Set(Object.keys(rows[0] ?? {}).map(normalizeHeader));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Cabecalhos ausentes: ${missingHeaders.join(', ')}`);
  }

  return rows.map((row, index) => {
    const normalizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
    const date = parseDate(normalizedRow.Data);
    const time = parseTime(normalizedRow.Hora);

    if (!date || !time) {
      throw new Error(`Linha ${index + 2}: Data ou Hora invalida.`);
    }

    return {
      reading_date: formatDate(date),
      reading_time: formatTime(time),
      observed_at: toObservedAt(date, time),
      computer: String(normalizedRow.Computador ?? '').trim(),
      unit: String(normalizedRow.Unidade ?? '').trim(),
      total_gb: parseNumber(normalizedRow.TotalGB),
      used_gb: parseNumber(normalizedRow.UsadoGB),
      free_gb: parseNumber(normalizedRow.LivreGB),
      percent_used: parseNumber(normalizedRow.PercentualUsado),
      percent_free: parseNumber(normalizedRow.PercentualLivre),
    };
  });
}
