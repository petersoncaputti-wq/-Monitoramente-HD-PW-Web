import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(rootDir, '.env.local');
const destinationPath = resolve(rootDir, 'public', 'dados', 'usuarios-pw-portal.xlsx');
const defaultSourceCandidates = [
  resolve(
    process.env.USERPROFILE ?? '',
    'OneDrive - Grupo Ecorodovias',
    'Área de Trabalho',
    'Usuários_PW_WEB.xlsx',
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

function normalizeHeader(value) {
  const compactHeader = String(value ?? '').trim().replace(/\s+/g, '');
  const aliasKey = compactHeader
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_.]/g, '')
    .toLowerCase();
  const aliases = {
    bloqueado: 'Locked',
    criacaodoperfil: 'ProfileCreationDate',
    email: 'Email',
    emailaddress: 'Email',
    ultimologin: 'LastLoginDate',
  };

  return aliases[aliasKey] ?? compactHeader;
}

function writeNormalizedPortalWorkbook(sourcePath, targetPath) {
  const workbook = XLSX.readFile(sourcePath, {
    cellDates: false,
    raw: true,
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('A fonte do Portal Bentley nao possui abas disponiveis.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
    ),
  );
  const outputWorkbook = XLSX.utils.book_new();
  const outputWorksheet = XLSX.utils.json_to_sheet(normalizedRows);

  XLSX.utils.book_append_sheet(outputWorkbook, outputWorksheet, 'Portal Bentley');
  XLSX.writeFile(outputWorkbook, targetPath, {
    bookType: 'xlsx',
    type: 'file',
  });
}

const env = readEnvFile(envPath);
const sourcePath =
  env.PORTAL_USERS_SOURCE_PATH ||
  env.PW_PORTAL_USERS_SOURCE_PATH ||
  env.VITE_PORTAL_USERS_SOURCE_PATH ||
  defaultSourceCandidates.find((candidate) => existsSync(candidate));

if (!sourcePath) {
  console.log(
    '[portal-users-sync] PORTAL_USERS_SOURCE_PATH nao configurado e fonte padrao nao encontrada; mantendo fonte atual.',
  );
  process.exit(0);
}

const resolvedSourcePath = resolve(sourcePath);

if (!existsSync(resolvedSourcePath)) {
  console.error(`[portal-users-sync] Arquivo nao encontrado: ${resolvedSourcePath}`);
  process.exit(1);
}

if (!statSync(resolvedSourcePath).isFile()) {
  console.error(`[portal-users-sync] O caminho configurado nao e um arquivo: ${resolvedSourcePath}`);
  process.exit(1);
}

const extension = extname(resolvedSourcePath).toLowerCase();

if (!['.xlsx', '.xls', '.csv'].includes(extension)) {
  console.error(
    `[portal-users-sync] Formato nao suportado: ${extension}. Use .xlsx, .xls ou .csv.`,
  );
  process.exit(1);
}

mkdirSync(dirname(destinationPath), { recursive: true });
writeNormalizedPortalWorkbook(resolvedSourcePath, destinationPath);

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
