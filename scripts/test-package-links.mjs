import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sanitizePackageLinks } from './sanitize-package-links.mjs';

const root = await mkdtemp(join(tmpdir(), 'package-links-'));
try {
  const nested = join(root, '@scope', 'package', 'node_modules', 'nested');
  await mkdir(nested, { recursive: true });
  const path = join(nested, 'package.json');
  const fixture = { name: 'fixture', contributors: ['Olsten Larck (https://i.am.charlike.online)', { name: 'tunnckoCore', url: 'http://charlike.online/about' }], scripts: { test: 'node test.js' }, dependencies: { example: '^1.0.0' } };
  await writeFile(path, JSON.stringify(fixture));
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 1 });
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved.contributors, ['Olsten Larck', { name: 'tunnckoCore', url: '' }]);
  assert.deepEqual(saved.scripts, fixture.scripts);
  assert.deepEqual(saved.dependencies, fixture.dependencies);
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 0 });
  const readme = join(nested, 'README.md');
  const code = join(nested, 'index.js');
  const originalCode = 'export const value = 42;\n';
  await writeFile(code, originalCode);
  await writeFile(readme, '# Example\n[dev-deps-url]: https://david-dm.org/inspect-js/hasOwn#info=devDependencies\nhttps://example.com/docs\n');
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 1 });
  assert.equal(await readFile(readme, 'utf8'), '# Example\n[dev-deps-url]: \nhttps://example.com/docs\n');
  assert.equal(await readFile(code, 'utf8'), originalCode);
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 0 });
  await writeFile(path, JSON.stringify({ scripts: { install: 'curl https://i.am.charlike.online/run' } }));
  await assert.rejects(sanitizePackageLinks(root), /fora dos créditos/);
  console.log('Limpeza automática: créditos, pacotes aninhados, idempotência e bloqueio fora dos créditos aprovados.');
} finally {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(root.includes('package-links-'));
  await rm(root, { recursive: true, force: true });
}
