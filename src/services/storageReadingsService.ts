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
  _accessToken?: string,
): Promise<ImportedWorkbookData> {
  const response = await fetch('/api/data/storage', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível carregar os dados de armazenamento.');
  const records = (await response.json()) as StorageReadingRecord[];

  return {
    fileName: 'Azure PostgreSQL - storage_readings',
    headers: STORAGE_HEADERS,
    kind: 'storage',
    rows: records.map(mapStorageReading),
  };
}
