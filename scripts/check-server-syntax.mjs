// Verifica a sintaxe de todo o código JavaScript do servidor (server/,
// scripts/) com o próprio Node (node --check), sem dependências externas.
// O frontend TypeScript é verificado pelo `tsc -b`.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(mjs|js)$/.test(entry.name)) yield path;
  }
}

const failures = [];
let checked = 0;
for (const directory of ['server', 'scripts']) {
  for (const file of files(join(root, directory))) {
    checked++;
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      failures.push(`${relative(root, file)}\n${String(error.stderr).trim()}`);
    }
  }
}

if (failures.length) {
  console.error(`Erros de sintaxe em ${failures.length} arquivo(s):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`Sintaxe OK em ${checked} arquivos do servidor.`);
