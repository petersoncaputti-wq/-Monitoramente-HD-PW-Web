import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const project = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const { blockedDomains } = JSON.parse(await readFile(new URL('./package-link-policy.json', import.meta.url), 'utf8'));
const findings = [];
const hosts = new Map();
let checked = 0;
const domainPattern = new RegExp(`(?:^|[^a-z0-9_.-])(?:[a-z0-9-]+\\.)*(?:${blockedDomains.map(domain => domain.replace(/\./g, '\\.')).join('|')})(?=$|[^a-z0-9_.-])`, 'gim');
async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (entry.name === '.git' || /^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') continue;
    const path = join(directory, entry.name);
    // Política e relatórios contêm indicadores inertes, não destinos da aplicação.
    if (['scripts/package-link-policy.json', 'package-link-audit.json'].some(file => path === resolve(project, file))) continue;
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.(?:[cm]?js|[jt]sx?|json|md|markdown|mdown|rst|txt|html|css|yml|yaml|map|svg|xml|sql)$/i.test(entry.name)) {
      checked++;
      const source = await readFile(path, 'utf8');
      // Detecta também domínios sem protocolo e URLs com barras escapadas em JSON.
      for (const match of source.matchAll(domainPattern)) {
        findings.push({ file: relative(project, path), line: source.slice(0, match.index).split('\n').length, host: match[0].replace(/^[^a-z0-9]/i, '').toLowerCase(), reasons: ['domínio bloqueado pela política local'] });
      }
      for (const match of source.matchAll(/https?:\/\/[^\s"'<>`\\)\]}]+/gi)) {
        let url;
        try { url = new URL(match[0]); } catch { continue; }
        const host = url.hostname.toLowerCase();
        hosts.set(host, (hosts.get(host) || 0) + 1);
        const reasons = [];
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
console.log(JSON.stringify({ note: 'Triagem local; os indicadores não comprovam conteúdo malicioso nem substituem reputação de URLs.', checked, hosts: Object.fromEntries([...hosts].sort(([a], [b]) => a.localeCompare(b))), findings }, null, 2));
if (findings.some(item => item.reasons.includes('domínio bloqueado pela política local'))) process.exitCode = 1;
