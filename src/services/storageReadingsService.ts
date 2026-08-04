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

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  return {
    anonKey,
    enabled: Boolean(url && anonKey),
    url,
  };
}

export function hasSupabaseStorageConfig(): boolean {
  return getSupabaseConfig().enabled;
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
  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey) {
    throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ler o Supabase.');
  }

  const records: StorageReadingRecord[] = [];
  let page = 0;

  while (true) {
    const endpoint = new URL('/rest/v1/storage_readings', config.url);
    endpoint.searchParams.set(
      'select',
      [
        'reading_date',
        'reading_time',
        'computer',
        'unit',
        'total_gb',
        'used_gb',
        'free_gb',
        'percent_used',
        'percent_free',
      ].join(','),
    );
    endpoint.searchParams.set('order', 'observed_at.asc');

    const from = page * STORAGE_READINGS_PAGE_SIZE;
    const to = from + STORAGE_READINGS_PAGE_SIZE - 1;
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken ?? config.anonKey}`,
        Range: `${from}-${to}`,
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
    fileName: 'Supabase - storage_readings',
    headers: STORAGE_HEADERS,
    kind: 'storage',
    rows: records.map(mapStorageReading),
  };
}
