import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(rootDir, '.env.local');
const destinationPath = resolve(rootDir, 'public', 'dados', 'chamados.xlsx');
const defaultSourceCandidates = [
  resolve(
    process.env.USERPROFILE ?? '',
    'OneDrive - Grupo Ecorodovias',
    'Área de Trabalho',
    'Analise Chamados.xlsx',
  ),
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
      headers: [],
      rowsCount: 0,
      sheetName: null,
    };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  return {
    headers: rows[0] ? Object.keys(rows[0]) : [],
    rowsCount: rows.length,
    sheetName: firstSheetName,
  };
}

const env = readEnvFile(envPath);
const sourcePath =
  env.TICKETS_SYNC_SOURCE_PATH ||
  env.VITE_TICKETS_SYNC_SOURCE_PATH ||
  defaultSourceCandidates.find((candidate) => existsSync(candidate));

if (!sourcePath) {
  console.log(
    '[tickets-sync] TICKETS_SYNC_SOURCE_PATH não configurado e fonte padrão não encontrada; mantendo fonte atual.',
  );
  process.exit(0);
}

const resolvedSourcePath = resolve(sourcePath);

if (!existsSync(resolvedSourcePath)) {
  console.error(`[tickets-sync] Arquivo não encontrado: ${resolvedSourcePath}`);
  process.exit(1);
}

if (!statSync(resolvedSourcePath).isFile()) {
  console.error(`[tickets-sync] O caminho configurado não é um arquivo: ${resolvedSourcePath}`);
  process.exit(1);
}

const extension = extname(resolvedSourcePath).toLowerCase();

if (!['.xlsx', '.xls', '.csv', '.xml'].includes(extension)) {
  console.error(
    `[tickets-sync] Formato não suportado: ${extension}. Use .xlsx, .xls, .csv ou .xml.`,
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
    destinationHash: getFileHash(destinationPath),
    destinationModifiedAt: destinationStats.mtime.toISOString(),
    destinationPath,
    destinationRowsCount: destinationWorkbook.rowsCount,
    destinationSheetName: destinationWorkbook.sheetName,
    destinationSize: destinationStats.size,
    sourceHash: getFileHash(resolvedSourcePath),
    sourceModifiedAt: sourceStats.mtime.toISOString(),
    sourcePath: resolvedSourcePath,
    sourceRowsCount: sourceWorkbook.rowsCount,
    sourceSheetName: sourceWorkbook.sheetName,
    sourceSize: sourceStats.size,
    syncedAt: new Date().toISOString(),
  }),
);
