export interface StorageImportResult {
  fileHash: string;
  fileName: string;
  importId: string;
  rowsImported: number;
  rowsRead: number;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    let parsedMessage = '';

    try {
      const parsedDetails = JSON.parse(details) as { error?: string; message?: string };
      parsedMessage = parsedDetails.message || parsedDetails.error || '';
    } catch {
      parsedMessage = '';
    }

    throw new Error(parsedMessage || details || `Erro HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export async function importStorageCsvFile(
  accessToken: string,
  file: File,
): Promise<StorageImportResult> {
  const content = await file.text();
  const response = await fetch('/api/storage-import', {
    body: JSON.stringify({
      content,
      fileName: file.name,
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return parseResponse<StorageImportResult>(response);
}
