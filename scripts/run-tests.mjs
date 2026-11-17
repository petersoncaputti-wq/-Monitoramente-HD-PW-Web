// Executa todos os scripts/test-*.mjs, um por vez, e falha se algum falhar.
// Testes novos entram automaticamente: basta criar scripts/test-<nome>.mjs.
// Uso: npm test            → todos
//      npm test -- auth saml → só os que contêm "auth" ou "saml" no nome
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 5 * 60_000;

// Exigem arquivos reais exportados do TOTVS como argumento; não rodam na CI.
const NEEDS_FIXTURES = new Map([
  ['test-totvs.mjs', 'ZIP de referência do TOTVS'],
  ['test-totvs-detailed.mjs', 'XLSX detalhado do TOTVS'],
  ['test-totvs-import.mjs', 'dois ZIPs do TOTVS'],
  ['test-totvs-scope.mjs', 'ZIP do TOTVS'],
]);

const filters = process.argv.slice(2);
const all = readdirSync(scriptsDir).filter((name) => /^test-.+\.mjs$/.test(name)).sort();
const selected = all.filter((name) => !filters.length || filters.some((filter) => name.includes(filter)));
const skipped = selected.filter((name) => NEEDS_FIXTURES.has(name));
const tests = selected.filter((name) => !NEEDS_FIXTURES.has(name));

if (!tests.length) {
  console.error(`Nenhum teste encontrado${filters.length ? ` para: ${filters.join(', ')}` : ''}.`);
  process.exit(1);
}

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(scriptsDir, name)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => { output += `\nTempo limite de ${TIMEOUT_MS / 1000}s excedido.`; child.kill(); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ name, ok: code === 0, output, seconds: ((Date.now() - started) / 1000).toFixed(1) });
    });
  });
}

const results = [];
for (const name of tests) {
  const result = await run(name);
  results.push(result);
  const lastLine = result.output.trim().split(/\r?\n/).pop() ?? '';
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${name} (${result.seconds}s)${result.ok ? ` — ${lastLine.slice(0, 120)}` : ''}`);
  if (!result.ok) console.log(result.output.split(/\r?\n/).map((line) => `     ${line}`).join('\n'));
}

for (const name of skipped) console.log(`SKIP ${name} — requer ${NEEDS_FIXTURES.get(name)}`);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram${skipped.length ? `, ${skipped.length} ignorados (exigem arquivos)` : ''}.`);
if (failed.length) {
  console.log(`Falharam: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
