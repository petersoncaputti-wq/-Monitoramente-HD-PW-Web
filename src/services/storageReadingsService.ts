import type { ImportedWorkbookData, MonitoringRow } from '@/types/monitoring';

interface StorageReadingRecord {
  reading_date: string;
  reading_time: string;
  computer: string;
  unit: string;
  total_gb: number | string | null;
  used_gb: number | string | null;
  free_gb: number | string | null;
  percent_used: number | string | null;
  percent_free: number | string | null;
}

const STORAGE_HEADERS = [
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

const STORAGE_READINGS_PAGE_SIZE = 1000;

export function hasSupabaseStorageConfig(): boolean {
  return true;
}

function normalizeTime(value: string): string {
  const [hours = '00', minutes = '00', seconds = '00'] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
}

function mapStorageReading(record: StorageReadingRecord): MonitoringRow {
  return {
    Data: record.reading_date,
    Hora: normalizeTime(record.reading_time),
    Computador: record.computer,
    Unidade: record.unit,
    TotalGB: record.total_gb ?? '',
    UsadoGB: record.used_gb ?? '',
    LivreGB: record.free_gb ?? '',
    PercentualUsado: record.percent_used ?? '',
    PercentualLivre: record.percent_free ?? '',
  };
}

export async function readStorageReadingsFromSupabase(
  accessToken?: string,
): Promise<ImportedWorkbookData> {
  const records: StorageReadingRecord[] = [];
  let page = 0;

  while (true) {
    const from = page * STORAGE_READINGS_PAGE_SIZE;
    const response = await fetch(`/api/storage-readings?limit=${STORAGE_READINGS_PAGE_SIZE}&offset=${from}`, {
      headers: {
        Authorization: `Bearer ${accessToken ?? ''}`,
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(
        details
          ? `Não foi possível ler storage_readings no Supabase: ${details}`
          : 'Não foi possível ler storage_readings no Supabase.',
      );
    }

    const pageRecords = (await response.json()) as StorageReadingRecord[];
    records.push(...pageRecords);

    if (pageRecords.length < STORAGE_READINGS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return {
    fileName: 'Azure PostgreSQL - storage_readings',
    headers: STORAGE_HEADERS,
    kind: 'storage',
    rows: records.map(mapStorageReading),
  };
}
