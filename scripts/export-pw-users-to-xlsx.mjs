import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const powerShellScriptPath = resolve(rootDir, 'scripts', 'export-pw-users.ps1');
const destinationPath = resolve(rootDir, 'public', 'dados', 'usuarios-pw-explorer.xlsx');
const tempDirectory = mkdtempSync(join(tmpdir(), 'pw-users-'));
const tempCsvPath = join(tempDirectory, 'usuarios-pw-explorer.csv');

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
    };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  return {
    sheetName: firstSheetName,
    rowsCount: rows.length,
  };
}

function parsePowerShellJson(stdout) {
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith('{') && line.endsWith('}'));

  if (!jsonLine) {
    return null;
  }

  try {
    return JSON.parse(jsonLine);
  } catch {
    return null;
  }
}

try {
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      powerShellScriptPath,
      '-OutputPath',
      tempCsvPath,
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    },
  );

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    process.exit(result.status ?? 1);
  }

  if (!existsSync(tempCsvPath)) {
    console.error('[pw-users-export] A extração não gerou o CSV temporário esperado.');
    process.exit(1);
  }

  mkdirSync(dirname(destinationPath), { recursive: true });

  const workbook = XLSX.readFile(tempCsvPath, {
    cellDates: false,
    raw: true,
  });

  XLSX.writeFile(workbook, destinationPath, {
    bookType: 'xlsx',
    type: 'file',
  });

  const sourceStats = statSync(tempCsvPath);
  const destinationStats = statSync(destinationPath);
  const sourceWorkbook = inspectWorkbook(tempCsvPath);
  const destinationWorkbook = inspectWorkbook(destinationPath);
  const powerShellResult = parsePowerShellJson(result.stdout);

  console.log(
    JSON.stringify({
      sourcePath: tempCsvPath,
      destinationPath,
      sourceSize: sourceStats.size,
      destinationSize: destinationStats.size,
      sourceHash: getFileHash(tempCsvPath),
      destinationHash: getFileHash(destinationPath),
      sourceRowsCount: sourceWorkbook.rowsCount,
      destinationRowsCount: destinationWorkbook.rowsCount,
      sourceSheetName: sourceWorkbook.sheetName,
      destinationSheetName: destinationWorkbook.sheetName,
      sourceModifiedAt: sourceStats.mtime.toISOString(),
      destinationModifiedAt: destinationStats.mtime.toISOString(),
      syncedAt: new Date().toISOString(),
      users: powerShellResult?.users ?? destinationWorkbook.rowsCount,
      inactiveDays: powerShellResult?.inactiveDays,
      exportedAt: powerShellResult?.exportedAt,
    }),
  );
} finally {
  rmSync(tempDirectory, {
    force: true,
    recursive: true,
  });
}

