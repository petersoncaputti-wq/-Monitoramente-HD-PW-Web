import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sanitizePackageLinks } from './sanitize-package-links.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'package-links-'));
const { blockedDomains } = JSON.parse(await readFile(new URL('./package-link-policy.json', import.meta.url), 'utf8'));
const blockedUrl = `https://i.am.${blockedDomains[0]}`;
try {
  const nested = join(root, '@scope', 'package', 'node_modules', 'nested');
  await mkdir(nested, { recursive: true });
  const path = join(nested, 'package.json');
  const fixture = { name: 'fixture', contributors: [`Olsten Larck (${blockedUrl})`, { name: 'tunnckoCore', url: `http://${blockedDomains[0]}/about` }], scripts: { test: 'node test.js' }, dependencies: { example: '^1.0.0' } };
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
  await writeFile(readme, `# Example\n[dev-deps-url]: https://${blockedDomains[1]}/inspect-js/hasOwn#info=devDependencies\nhttps://example.com/docs\n`);
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 1 });
  assert.equal(await readFile(readme, 'utf8'), '# Example\n[dev-deps-url]: \nhttps://example.com/docs\n');
  assert.equal(await readFile(code, 'utf8'), originalCode);
  assert.deepEqual(await sanitizePackageLinks(root), { checked: 1, changed: 0 });
  await writeFile(path, JSON.stringify({ scripts: { install: `curl ${blockedUrl}/run` } }));
  await assert.rejects(sanitizePackageLinks(root), /fora dos créditos/);
  const audit = () => spawnSync(process.execPath, [fileURLToPath(new URL('./audit-package-links.mjs', import.meta.url)), root], { encoding: 'utf8' });
  assert.equal(audit().status, 1, 'Auditoria deve bloquear URL em script de instalação');
  await writeFile(path, JSON.stringify({ name: 'fixture' }));
  const bundle = join(root, 'dist');
  await mkdir(bundle);
  for (const text of [`// ${blockedDomains[0]}`, JSON.stringify({ url: blockedUrl }).replaceAll('/', '\\/'), `//cdn.${blockedDomains[0]}/asset`]) {
    await writeFile(join(bundle, 'bundle.js.map'), text);
    assert.equal(audit().status, 1, 'Build, source maps e referências sem protocolo devem ser verificados');
  }
  await writeFile(join(bundle, 'bundle.js.map'), `// https://${blockedDomains[0]}.example.test\n// https://example.com`);
  assert.equal(audit().status, 0, 'Sufixos de outro domínio não devem ser bloqueados');
  console.log('Limpeza automática: créditos, pacotes aninhados, idempotência e bloqueio fora dos créditos aprovados.');
} finally {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(root.includes('package-links-'));
  await rm(root, { recursive: true, force: true });
}
