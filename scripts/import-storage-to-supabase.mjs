import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

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

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  const content = readFileSync(path, 'utf-8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return values;
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)) : null;
  }

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { hours, minutes, seconds };
  }

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

function readCsvRows(filePath) {
  const content = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
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

function getFileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function findLatestStorageCsv(directory) {
  if (!directory || !existsSync(directory)) {
    return null;
  }

  const candidates = readdirSync(directory)
    .filter((fileName) => /^historico_\d{4}-\d{2}-\d{2}\.csv$/i.test(fileName))
    .map((fileName) => {
      const filePath = join(directory, fileName);
      const stats = statSync(filePath);

      return {
        filePath,
        modifiedAt: stats.mtime.getTime(),
      };
    })
    .filter((candidate) => statSync(candidate.filePath).isFile())
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  return candidates[0]?.filePath ?? null;
}

function resolveStorageSourcePath(rootDir, env, args) {
  const explicitPath = args.find((arg) => !arg.startsWith('--'));

  if (explicitPath) {
    return resolve(explicitPath);
  }

  if (env.STORAGE_IMPORT_SOURCE_PATH) {
    return resolve(env.STORAGE_IMPORT_SOURCE_PATH);
  }

  const latestCsv = findLatestStorageCsv(env.STORAGE_IMPORT_SOURCE_DIR);

  if (latestCsv) {
    return latestCsv;
  }

  return resolve(rootDir, 'public', 'dados', 'armazenamento.xlsx');
}

async function supabaseRequest(env, path, options = {}) {
  const baseUrl = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceKey) {
    throw new Error('Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'storage-import-script/1.0',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status} ao chamar Supabase.`);
  }

  return response.json();
}

function readStorageRows(filePath) {
  const extension = extname(filePath).toLowerCase();

  if (!['.csv', '.xlsx', '.xls', '.xml'].includes(extension)) {
    throw new Error('Formato nao suportado. Use .csv, .xlsx, .xls ou .xml.');
  }

  const rows =
    extension === '.csv'
      ? readCsvRows(filePath)
      : (() => {
          const workbook = XLSX.readFile(filePath, {
            cellDates: false,
            raw: false,
          });
          const firstSheetName = workbook.SheetNames[0];

          if (!firstSheetName) {
            throw new Error('A planilha nao possui abas disponiveis.');
          }

          const worksheet = workbook.Sheets[firstSheetName];
          return XLSX.utils.sheet_to_json(worksheet, {
            defval: '',
            raw: true,
          });
        })();

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

async function main() {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const env = {
    ...process.env,
    ...readEnvFile(resolve(rootDir, '.env.local')),
  };
  const filePath = resolveStorageSourcePath(rootDir, env, args);

  if (!existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }

  const fileName = basename(filePath);
  const fileHash = getFileHash(filePath);
  const rows = readStorageRows(filePath);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          fileName,
          filePath,
          fileHash,
          rowsRead: rows.length,
          firstReading: rows[0] ?? null,
          lastReading: rows[rows.length - 1] ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const [importRecord] = await supabaseRequest(env, '/rest/v1/storage_imports', {
    body: JSON.stringify([
      {
        file_name: fileName,
        file_hash: fileHash,
        rows_read: rows.length,
        rows_imported: 0,
        status: 'completed',
      },
    ]),
    method: 'POST',
  });

  const rowsWithImportId = rows.map((row) => ({
    ...row,
    import_id: importRecord.id,
  }));

  const importedRows = await supabaseRequest(
    env,
    '/rest/v1/storage_readings?on_conflict=observed_at,computer,unit',
    {
      body: JSON.stringify(rowsWithImportId),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
  );

  await supabaseRequest(env, `/rest/v1/storage_imports?id=eq.${importRecord.id}`, {
    body: JSON.stringify({
      rows_imported: importedRows.length,
      status: 'completed',
    }),
    headers: {
      Prefer: 'return=representation',
    },
    method: 'PATCH',
  });

  console.log(
    JSON.stringify({
      fileName,
      rowsRead: rows.length,
      rowsImported: importedRows.length,
      importId: importRecord.id,
    }),
  );
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
