import { createHash } from 'node:crypto';
import { requireAdmin } from './_auth.mjs';
import { insertRows, transaction } from './_database.mjs';

const REQUIRED_HEADERS = [
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

function getEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error('Variaveis Supabase ausentes no servidor.');
  }

  return { publishableKey, secretKey, url };
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function supabaseRequest(path, options = {}) {
  const { secretKey, url } = getEnv();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'storage-import-api/1.0',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  return parseJsonResponse(response);
}

async function getCaller(accessToken) {
  const { publishableKey, url } = getEnv();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseJsonResponse(response);
}

async function assertAdmin(headers) {
  const authorization = headers.authorization ?? headers.Authorization ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return { error: 'Sessão ausente.', status: 401 };
  }

  const caller = await getCaller(accessToken);
  const profiles = await supabaseRequest(
    `/rest/v1/app_profiles?select=id,email,role&id=eq.${encodeURIComponent(caller.id)}&limit=1`,
  );

  if (profiles[0]?.role !== 'admin') {
    return { error: 'Acesso restrito a administradores.', status: 403 };
  }

  return { caller, profile: profiles[0] };
}

function normalizeHeader(value) {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseDate(value) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    const brMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (brMatch) {
      const [, day, month, year] = brMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }

    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }

  return null;
}

function parseTime(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);

    if (hours > 23 || minutes > 59 || seconds > 59) {
      return null;
    }

    return { hours, minutes, seconds };
  }

  return null;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function readCsvRows(content) {
  const normalizedContent = String(content ?? '').replace(/^\uFEFF/, '');
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? '').map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(time) {
  return [time.hours, time.minutes, time.seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function toObservedAt(date, time) {
  const observedAt = new Date(date);
  observedAt.setUTCHours(time.hours, time.minutes, time.seconds, 0);
  return observedAt.toISOString();
}

function getContentHash(content) {
  return createHash('sha256').update(String(content ?? '')).digest('hex');
}

function parseStorageCsv(content) {
  const rows = readCsvRows(content);
  const headers = new Set(Object.keys(rows[0] ?? {}).map(normalizeHeader));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Cabecalhos ausentes: ${missingHeaders.join(', ')}`);
  }

  return rows.map((row, index) => {
    const normalizedRow = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
    );
    const date = parseDate(normalizedRow.Data);
    const time = parseTime(normalizedRow.Hora);

    if (!date || !time) {
      throw new Error(`Linha ${index + 2}: Data ou Hora invalida.`);
    }

    return {
      reading_date: formatDate(date),
      reading_time: formatTime(time),
      observed_at: toObservedAt(date, time),
      computer: String(normalizedRow.Computador ?? '').trim(),
      unit: String(normalizedRow.Unidade ?? '').trim(),
      total_gb: parseNumber(normalizedRow.TotalGB),
      used_gb: parseNumber(normalizedRow.UsadoGB),
      free_gb: parseNumber(normalizedRow.LivreGB),
      percent_used: parseNumber(normalizedRow.PercentualUsado),
      percent_free: parseNumber(normalizedRow.PercentualLivre),
    };
  });
}

async function importStorageCsv(body) {
  const fileName = String(body.fileName ?? '').trim();
  const content = String(body.content ?? '');

  if (!fileName.toLowerCase().endsWith('.csv')) {
    return { error: 'Selecione um arquivo .csv.', status: 400 };
  }

  if (!content.trim()) {
    return { error: 'O arquivo CSV esta vazio.', status: 400 };
  }

  const fileHash = getContentHash(content);
  const rows = parseStorageCsv(content);

  const migration = await transaction(async (client) => {
    const created = await client.query(
      `insert into storage_imports (file_hash, file_name, rows_imported, rows_read, status)
       values ($1, $2, 0, $3, 'completed') returning id`,
      [fileHash, fileName, rows.length],
    );
    const importId = created.rows[0].id;
    const rowsWithImportId = rows.map((row) => ({ ...row, import_id: importId }));
    const conflict = `on conflict (observed_at, computer, unit) do update set
      import_id = excluded.import_id, reading_date = excluded.reading_date,
      reading_time = excluded.reading_time, total_gb = excluded.total_gb,
      used_gb = excluded.used_gb, free_gb = excluded.free_gb,
      percent_used = excluded.percent_used, percent_free = excluded.percent_free`;
    let rowsImported = 0;
    for (let index = 0; index < rowsWithImportId.length; index += 500) {
      rowsImported += (await insertRows(client, 'storage_readings', rowsWithImportId.slice(index, index + 500), conflict)).length;
    }
    await client.query('update storage_imports set rows_imported = $2 where id = $1', [importId, rowsImported]);
    return { importId, rowsImported };
  });

  return {
    body: {
      fileHash,
      fileName,
      importId: migration.importId,
      rowsImported: migration.rowsImported,
      rowsRead: rows.length,
    },
    status: 200,
  };
}

export async function handleStorageImportRequest({ body, headers, method }) {
  if (method !== 'POST') {
    return { error: 'Método não permitido.', status: 405 };
  }

  const adminCheck = await requireAdmin(headers);

  if (adminCheck.error) {
    return adminCheck;
  }

  return importStorageCsv(body ?? {});
}

export default async function handler(request, response) {
  try {
    const result = await handleStorageImportRequest({
      body: request.body ?? {},
      headers: request.headers,
      method: request.method,
    });

    response.status(result.status).json(result.error ? { error: result.error } : result.body);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Erro inesperado.',
    });
  }
}
