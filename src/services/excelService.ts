import * as XLSX from 'xlsx';
import type {
  ImportedWorkbookData,
  MonitoringRow,
  ProjectWiseWebUserRow,
  ProjectWiseUserRow,
  TicketRow,
  WorkbookKind,
} from '@/types/monitoring';
import {
  hasMonitoringHeaders,
  hasProjectWiseWebUserHeaders,
  hasProjectWiseUserHeaders,
  hasTicketHeaders,
  isValidHeader,
  mapHeaders,
} from '@/utils/excel';

function parseWorkbookBuffer(buffer: ArrayBuffer, fileName: string): ImportedWorkbookData {
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
      fileName,
      rows: [],
      headers: [],
      kind: 'unknown',
    };
  }

  const rawHeaders = Object.keys(rows[0]);
  const normalizedHeaders = mapHeaders(rawHeaders);
  const kind: WorkbookKind = hasMonitoringHeaders(rawHeaders)
    ? 'storage'
    : hasProjectWiseUserHeaders(rawHeaders)
      ? 'projectWiseUsers'
      : hasProjectWiseWebUserHeaders(rawHeaders)
        ? 'projectWiseWebUsers'
        : hasTicketHeaders(rawHeaders)
          ? 'tickets'
          : 'unknown';

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => isValidHeader(key))
        .map(([key, value]) => [key.trim().replace(/\s+/g, ''), value]),
    ),
  ) as Array<MonitoringRow | ProjectWiseUserRow | ProjectWiseWebUserRow | TicketRow>;

  if (kind === 'unknown') {
    console.warn(
      'A planilha foi lida, mas os cabeçalhos esperados não foram encontrados integralmente.',
    );
  }

  return {
    fileName,
    rows: normalizedRows,
    headers: normalizedHeaders,
    kind,
  };
}

export async function readMonitoringWorkbook(
  file: File,
): Promise<ImportedWorkbookData> {
  const buffer = await file.arrayBuffer();
  return parseWorkbookBuffer(buffer, file.name);
}

export async function readMonitoringWorkbookFromUrl(
  url: string,
  fileName?: string,
): Promise<ImportedWorkbookData> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Fonte nao encontrada: ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/html')) {
    throw new Error(
      'A URL configurada abriu uma pagina HTML. Use um link direto de download da planilha ou uma fonte sem login.',
    );
  }

  const buffer = await response.arrayBuffer();
  const sourceName = fileName ?? decodeURIComponent(url.split('/').pop() ?? 'fonte externa');

  return parseWorkbookBuffer(buffer, sourceName);
}
