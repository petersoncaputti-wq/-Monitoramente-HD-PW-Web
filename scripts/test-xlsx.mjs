import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import XLSXDefault from 'xlsx';
import * as XLSXNamespace from 'xlsx';

// 1. Versão sem as CVEs de prototype pollution (CVE-2023-30533) e ReDoS
//    (CVE-2024-22363): exige >= 0.20.2. O npm parou na 0.18.5 (vulnerável);
//    a versão corrigida é o pacote oficial da SheetJS guardado em vendor/.
const version = JSON.parse(readFileSync(new URL('../node_modules/xlsx/package.json', import.meta.url), 'utf8')).version;
const [major, minor, patch] = version.split('.').map(Number);
assert.ok(major > 0 || minor > 20 || (minor === 20 && patch >= 2), `xlsx ${version} tem vulnerabilidades conhecidas; use >= 0.20.2`);

// 2. Nenhuma dependência por URL ou git. O App Service roda "npm ci --omit=dev"
//    a cada inicialização com npm 12, que recusa esses tipos (EALLOWREMOTE) e
//    derruba o painel. Use o registro npm ou um arquivo local (file:vendor/...).
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  assert.ok(!/^(https?:|git(\+[a-z]+)?:|github:|[\w.-]+\/[\w.-]+(#|$))/i.test(spec), `${name}: "${spec}" é remoto; o npm do App Service recusa (EALLOWREMOTE)`);
}
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const xlsxLock = lock.packages['node_modules/xlsx'];
assert.equal(xlsxLock.resolved, 'file:vendor/xlsx-0.20.3.tgz');
assert.ok(xlsxLock.integrity?.startsWith('sha512-'), 'lock sem hash de integridade do xlsx');

// 3. As três formas de importação usadas no projeto funcionam:
//    default (server/services), namespace (api/, frontend) e require (scripts/).
const XLSXRequire = createRequire(import.meta.url)('xlsx');
for (const [name, XLSX] of [['default', XLSXDefault], ['namespace', XLSXNamespace], ['require', XLSXRequire]]) {
  assert.equal(typeof XLSX.read, 'function', `${name}: read`);
  assert.equal(typeof XLSX.write, 'function', `${name}: write`);
  assert.equal(typeof XLSX.utils?.sheet_to_json, 'function', `${name}: utils`);
}

// 4. Ida e volta em memória (como as importações do servidor fazem com Buffer).
const workbook = XLSXNamespace.utils.book_new();
XLSXNamespace.utils.book_append_sheet(workbook, XLSXNamespace.utils.aoa_to_sheet([['Nome', 'Valor'], ['Ana', 10], ['Caio', 2.5]]), 'Dados');
const buffer = XLSXNamespace.write(workbook, { type: 'buffer', bookType: 'xlsx' });
const parsed = XLSXDefault.read(buffer, { type: 'buffer' });
assert.deepEqual(XLSXDefault.utils.sheet_to_json(parsed.Sheets.Dados), [{ Nome: 'Ana', Valor: 10 }, { Nome: 'Caio', Valor: 2.5 }]);

// 5. Planilha com chave "__proto__" não polui Object.prototype.
const hostile = XLSXNamespace.utils.book_new();
XLSXNamespace.utils.book_append_sheet(hostile, XLSXNamespace.utils.aoa_to_sheet([['__proto__', 'x'], ['{"poluido":true}', 1]]), 'S');
XLSXDefault.utils.sheet_to_json(XLSXDefault.read(XLSXNamespace.write(hostile, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }).Sheets.S);
assert.equal(({}).poluido, undefined);

console.log(`xlsx ${version}: versão corrigida, importações default/namespace/require e leitura/escrita em memória: OK.`);
