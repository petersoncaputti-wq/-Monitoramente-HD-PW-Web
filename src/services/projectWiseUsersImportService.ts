export type ProjectWiseUsersSourceKind = 'explorer' | 'portal';

export interface ProjectWiseUsersImportResult {
  fileHash: string;
  fileName: string;
  importId: string;
  rowsImported: number;
  rowsRead: number;
  sourceKind: ProjectWiseUsersSourceKind;
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo selecionado.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function importProjectWiseUsersFile(
  accessToken: string,
  sourceKind: ProjectWiseUsersSourceKind,
  file: File,
): Promise<ProjectWiseUsersImportResult> {
  const contentBase64 = await fileToBase64(file);
  const response = await fetch('/api/pw-users-import', {
    body: JSON.stringify({
      contentBase64,
      fileName: file.name,
      sourceKind,
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return parseResponse<ProjectWiseUsersImportResult>(response);
}
