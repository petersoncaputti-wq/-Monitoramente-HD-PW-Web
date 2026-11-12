import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Remove somente links dos créditos. Referências fora dos créditos exigem revisão.
const policy = JSON.parse(await readFile(new URL('./package-link-policy.json', import.meta.url), 'utf8'));
if (!Array.isArray(policy.blockedDomains) || !policy.blockedDomains.length || policy.blockedDomains.some(domain => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain))) {
  throw new Error('Lista de domínios bloqueados inválida.');
}
const domains = policy.blockedDomains.map(domain => domain.replace(/\./g, '\\.')).join('|');
const blocked = new RegExp(`(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*(?:${domains})(?=[\\s/:?#"<>)]|$)[^\\s"<>)]*`, 'gi');
const documentationLink = blocked;
const clean = value => {
  if (typeof value === 'string') return value.replace(blocked, '').replace(/\(\s*\)/g, '').trim();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  return value;
};

export async function sanitizePackageLinks(root) {
  let checked = 0, changed = 0;
  async function walk(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT' && directory === root) return; throw error; }
    for (const entry of entries) {
      // Não segue links simbólicos para fora da árvore de dependências.
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(?:md|markdown|mdown|rst|txt)$/i.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        const result = source.replace(documentationLink, '');
        if (result !== source) {
          await writeFile(path, result);
          changed++;
        }
      }
      else if (entry.isFile() && entry.name === 'package.json') {
        checked++;
        const source = await readFile(path, 'utf8');
        if (!source.match(blocked)) continue;
        const manifest = JSON.parse(source);
        for (const key of ['author', 'contributors', 'maintainers']) {
          if (key in manifest) manifest[key] = clean(manifest[key]);
        }
        const result = JSON.stringify(manifest, null, 2) + '\n';
        if (result.match(blocked)) throw new Error(`Link bloqueado fora dos créditos: ${path}. Revise o pacote antes de continuar.`);
        await writeFile(path, result);
        changed++;
      }
    }
  }
  await walk(root);
  return { checked, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules');
  const result = await sanitizePackageLinks(root);
  console.log(`Links de dependências: ${result.checked} manifestos verificados; ${result.changed} arquivos higienizados.`);
}
