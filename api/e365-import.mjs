import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

const REQUIRED_HEADERS = [
  'ProductID',
  'Product',
  'ImsID',
  'UniquePersona',
  'UsageQuarter',
  'Net',
];

function asText(value) {
  return String(value ?? '').trim();
}

function asAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = asText(value);
  if (!text) return null;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function getE365ContentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function readE365Rows(buffer) {
  const workbook = XLSX.read(buffer, {
    cellDates: false,
    raw: false,
    type: 'buffer',
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  return XLSX.utils
    .sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false })
    .filter((row) => Object.values(row).some((value) => asText(value)));
}

export function assertE365Headers(rows) {
  const headers = new Set(Object.keys(rows[0] ?? {}).map(asText));
  const isApplicationUsageExport =
    headers.has('ProductName') &&
    headers.has('Email') &&
    headers.has('TotalMinutes') &&
    !headers.has('Net');

  if (isApplicationUsageExport) {
    throw new Error(
      'Arquivo de Application Usage detectado. Para alimentar gastos e usuários faturados, exporte o tipo E365 Usage Data.',
    );
  }

  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length) {
    throw new Error(`Cabeçalhos E365 ausentes: ${missing.join(', ')}`);
  }
}

export function mapE365Row(row, importId) {
  const mapped = {
    account_name: asText(row.AccountName),
    connection_status: asText(row.IsConnected),
    country_iso: asText(row.CountryIso),
    currency: asText(row.Currency) || 'BRL',
    exported_at: asText(row.ExportedOn),
    gross_amount: asAmount(row.Gross),
    ims_id: asText(row.ImsID),
    import_id: importId,
    net_amount: asAmount(row.Net),
    persona_email: asText(row.UniquePersona).toLowerCase(),
    product_id: asText(row.ProductID),
    product_name: asText(row.Product),
    raw_data: row,
    ultimate_id: asText(row.UltimateID),
    usage_date: asText(row.UsageDate),
    usage_interval: asText(row.UsageInterval),
    usage_quarter: asText(row.UsageQuarter),
  };

  if (!mapped.usage_quarter || !mapped.ims_id || !mapped.product_id || !mapped.product_name) {
    throw new Error('Registro E365 sem quarter, IMSID, ProductID ou aplicação.');
  }

  return mapped;
}
