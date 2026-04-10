import * as XLSX from 'xlsx';
import type { ImportedWorkbookData, MonitoringRow } from '@/types/monitoring';
import { hasMonitoringHeaders, isValidHeader, mapHeaders } from '@/utils/excel';

export async function readMonitoringWorkbook(
  file: File,
): Promise<ImportedWorkbookData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    raw: false,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('O arquivo não possui abas disponíveis.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  if (rows.length === 0) {
    return {
      fileName: file.name,
      rows: [],
      headers: [],
    };
  }

  const rawHeaders = Object.keys(rows[0]);
  const normalizedHeaders = mapHeaders(rawHeaders);

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => isValidHeader(key))
        .map(([key, value]) => [key.trim().replace(/\s+/g, ''), value]),
    ),
  ) as MonitoringRow[];

  if (!hasMonitoringHeaders(rawHeaders)) {
    console.warn(
      'A planilha foi lida, mas os cabeçalhos esperados não foram encontrados integralmente.',
    );
  }

  return {
    fileName: file.name,
    rows: normalizedRows,
    headers: normalizedHeaders,
  };
}
