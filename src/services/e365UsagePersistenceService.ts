import type { E365UsageRow } from '@/types/monitoring';

interface E365UsageRecord {
  account_name: string | null;
  connection_status: string | null;
  country_iso: string | null;
  currency: string | null;
  exported_at: string | null;
  gross_amount: number | null;
  ims_id: string;
  net_amount: number | null;
  persona_email: string | null;
  product_id: string;
  product_name: string;
  ultimate_id: string | null;
  usage_date: string | null;
  usage_interval: string | null;
  usage_quarter: string;
}

export interface E365ImportResult {
  fileHash: string;
  fileName: string;
  importId: string;
  rowsImported: number;
  rowsRead: number;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    let message = '';
    try {
      const parsed = JSON.parse(details) as { error?: string };
      message = parsed.error ?? '';
    } catch {
      message = '';
    }
    throw new Error(message || details || `Erro HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo E365.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function importE365UsageFile(file: File): Promise<E365ImportResult> {
  const response = await fetch('/api/e365-import', {
    body: JSON.stringify({
      contentBase64: await fileToBase64(file),
      fileName: file.name,
    }),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  return parseResponse<E365ImportResult>(response);
}

export async function readE365UsageFromDatabase(): Promise<E365UsageRow[]> {
  const records = await parseResponse<E365UsageRecord[]>(
    await fetch('/api/data/e365', { credentials: 'same-origin' }),
  );

  return records.map((record) => ({
    AccountName: record.account_name ?? '',
    CountryIso: record.country_iso ?? '',
    Currency: record.currency ?? 'BRL',
    ExportedOn: record.exported_at ?? '',
    Gross: record.gross_amount ?? '',
    ImsID: record.ims_id,
    IsConnected: record.connection_status ?? '',
    Net: record.net_amount ?? '',
    Product: record.product_name,
    ProductID: record.product_id,
    UltimateID: record.ultimate_id ?? '',
    UniquePersona: record.persona_email ?? '',
    UsageDate: record.usage_date ?? '',
    UsageInterval: record.usage_interval ?? '',
    UsageQuarter: record.usage_quarter,
  }));
}
