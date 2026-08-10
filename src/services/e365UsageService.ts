import * as XLSX from 'xlsx';
import type { E365UsageRow } from '@/types/monitoring';

const REQUIRED_HEADERS = [
  'Product',
  'ImsID',
  'UniquePersona',
  'UsageQuarter',
  'Net',
] as const;

export async function readE365UsageFile(file: File): Promise<E365UsageRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: false,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('O arquivo não possui uma planilha disponível.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const isApplicationUsageExport =
    headers.includes('ProductName') &&
    headers.includes('Email') &&
    headers.includes('TotalMinutes') &&
    !headers.includes('Net');

  if (isApplicationUsageExport) {
    throw new Error(
      'Arquivo de Application Usage detectado. Exporte o tipo E365 Usage Data para obter quarter e valores de cobrança.',
    );
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Arquivo E365 inválido. Colunas ausentes: ${missingHeaders.join(', ')}.`);
  }

  return rows as E365UsageRow[];
}

export function mergeE365UsageRows(
  currentRows: E365UsageRow[],
  importedRows: E365UsageRow[],
): E365UsageRow[] {
  const rowsByKey = new Map<string, E365UsageRow>();

  for (const row of [...currentRows, ...importedRows]) {
    const key = [row.UsageQuarter, row.ImsID, row.ProductID || row.Product]
      .map((value) => String(value ?? '').trim().toLowerCase())
      .join('|');

    if (key.replace(/\|/g, '')) {
      rowsByKey.set(key, row);
    }
  }

  return [...rowsByKey.values()];
}
