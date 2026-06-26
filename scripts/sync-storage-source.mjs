import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(rootDir, '.env.local');
const destinationPath = resolve(rootDir, 'public', 'dados', 'armazenamento.xlsx');
const defaultSourceCandidates = [
  resolve(
    process.env.USERPROFILE ?? '',
    'OneDrive - Grupo Ecorodovias',
    'Área de Trabalho',
    'analise_armazenamento.xlsx',
  ),
  resolve(process.env.USERPROFILE ?? '', 'OneDrive', 'analise_armazenamento.xlsx'),
];

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const content = readFileSync(path, 'utf-8');
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return values;
}

function getFileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function inspectWorkbook(path) {
  const workbook = XLSX.readFile(path, {
    cellDates: false,
    raw: false,
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      sheetName: null,
      rowsCount: 0,
      headers: [],
    };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  return {
    sheetName: firstSheetName,
    rowsCount: rows.length,
    headers: rows[0] ? Object.keys(rows[0]) : [],
  };
}

const env = readEnvFile(envPath);
const sourcePath =
  env.STORAGE_SYNC_SOURCE_PATH ||
  env.VITE_STORAGE_SYNC_SOURCE_PATH ||
  defaultSourceCandidates.find((candidate) => existsSync(candidate));

if (!sourcePath) {
  console.log(
    '[storage-sync] STORAGE_SYNC_SOURCE_PATH nao configurado e fonte padrao nao encontrada; mantendo fonte atual.',
  );
  process.exit(0);
}

const resolvedSourcePath = resolve(sourcePath);

if (!existsSync(resolvedSourcePath)) {
  console.error(`[storage-sync] Arquivo nao encontrado: ${resolvedSourcePath}`);
  process.exit(1);
}

if (!statSync(resolvedSourcePath).isFile()) {
  console.error(`[storage-sync] O caminho configurado nao e um arquivo: ${resolvedSourcePath}`);
  process.exit(1);
}

const extension = extname(resolvedSourcePath).toLowerCase();

if (!['.xlsx', '.xls', '.csv', '.xml'].includes(extension)) {
  console.error(
    `[storage-sync] Formato nao suportado: ${extension}. Use .xlsx, .xls, .csv ou .xml.`,
  );
  process.exit(1);
}

mkdirSync(dirname(destinationPath), { recursive: true });
copyFileSync(resolvedSourcePath, destinationPath);

const sourceStats = statSync(resolvedSourcePath);
const destinationStats = statSync(destinationPath);
const sourceWorkbook = inspectWorkbook(resolvedSourcePath);
const destinationWorkbook = inspectWorkbook(destinationPath);

console.log(
  JSON.stringify({
    sourcePath: resolvedSourcePath,
    destinationPath,
    sourceSize: sourceStats.size,
    destinationSize: destinationStats.size,
    sourceHash: getFileHash(resolvedSourcePath),
    destinationHash: getFileHash(destinationPath),
    sourceRowsCount: sourceWorkbook.rowsCount,
    destinationRowsCount: destinationWorkbook.rowsCount,
    sourceSheetName: sourceWorkbook.sheetName,
    destinationSheetName: destinationWorkbook.sheetName,
    sourceModifiedAt: sourceStats.mtime.toISOString(),
    destinationModifiedAt: destinationStats.mtime.toISOString(),
    syncedAt: new Date().toISOString(),
  }),
);
