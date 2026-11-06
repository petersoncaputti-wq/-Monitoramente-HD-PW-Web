import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const project = fileURLToPath(new URL('../', import.meta.url));
const { blockedDomains } = JSON.parse(await readFile(new URL('./package-link-policy.json', import.meta.url), 'utf8'));
const findings = [];
async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (['.git', 'dist', '.env', '.env.local'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    // A própria suíte inclui URLs bloqueadas como dados de teste.
    if (path === join(project, 'scripts', 'test-package-links.mjs')) continue;
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.(?:[cm]?js|[jt]sx?|json|md|markdown|txt|html|css|yml|yaml)$/i.test(entry.name)) {
      const source = await readFile(path, 'utf8');
      for (const match of source.matchAll(/https?:\/\/[^\s"'<>`\\)\]}]+/gi)) {
        let url;
        try { url = new URL(match[0]); } catch { continue; }
        const host = url.hostname.toLowerCase();
        const reasons = [];
        if (blockedDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) reasons.push('domínio bloqueado pela política local');
        if (url.username || url.password) reasons.push('credenciais na URL');
        if (host.split('.').some(label => label.startsWith('xn--'))) reasons.push('domínio internacional em punycode: revisar');
        if (isIP(host.replace(/^\[|\]$/g, '')) && !['127.0.0.1', '::1', '0.0.0.0'].includes(host.replace(/^\[|\]$/g, ''))) reasons.push('endereço IP literal: revisar');
        if (reasons.length) findings.push({ file: relative(project, path), line: source.slice(0, match.index).split('\n').length, host, reasons });
      }
    }
  }
}
await walk(resolve(project));
// Não imprime caminhos de URL, consultas ou credenciais que possam conter segredos.
console.log(JSON.stringify({ note: 'Triagem local; os indicadores não comprovam conteúdo malicioso nem substituem reputação de URLs.', findings }, null, 2));
if (findings.some(item => item.reasons.includes('domínio bloqueado pela política local'))) process.exitCode = 1;
