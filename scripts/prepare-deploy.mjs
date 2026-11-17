// Monta o pacote enxuto publicado no Azure App Service, em deploy/.
// Contém só o que o servidor usa em produção: o frontend compilado (dist/),
// o servidor (server/, api/), o modelo da importação Eco lido em runtime e as
// dependências de produção. Antes, o deploy enviava a pasta inteira, com
// todas as dependências de desenvolvimento, e o App Service levava ~6 min
// para voltar a cada deploy.
// Uso: npm run build && node scripts/prepare-deploy.mjs [--offline]
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = join(root, 'deploy');

// Arquivos e pastas lidos pelo servidor em produção.
const RUNTIME_PATHS = [
  'dist',
  'server',
  'api',
  'src/data/kartado-eco/acompanhamento.json',
  'package-lock.json',
  // Dependências guardadas no repositório (ex.: xlsx). O App Service roda
  // "npm ci --omit=dev" a cada inicialização e o npm 12 recusa pacotes por
  // URL (EALLOWREMOTE); o arquivo local precisa estar no pacote.
  'vendor',
];

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('dist/ não encontrado: rode "npm run build" antes.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
for (const path of RUNTIME_PATHS) {
  cpSync(join(root, path), join(target, path), { recursive: true });
}

// package.json mínimo: só "start". Os demais scripts (postinstall, build...)
// dependem de arquivos que não vão no pacote e quebrariam um "npm install"
// feito pelo próprio App Service.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(
  join(target, 'package.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      private: true,
      version: pkg.version,
      type: pkg.type,
      engines: pkg.engines,
      scripts: { start: pkg.scripts.start },
      dependencies: pkg.dependencies,
    },
    null,
    2,
  )}\n`,
);

// Argumentos fixos (sem entrada externa), então a linha de comando é segura.
const flags = ['--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
if (process.argv.includes('--offline')) flags.push('--offline');
execSync(`npm ci ${flags.join(' ')}`, { cwd: target, stdio: 'inherit' });

// --ignore-scripts pula o postinstall: aplica aqui a mesma higienização de
// links das dependências que o projeto aplica no node_modules principal.
const { sanitizePackageLinks } = await import('./sanitize-package-links.mjs');
const sanitized = await sanitizePackageLinks(join(target, 'node_modules'));
console.log(
  `Links de dependências do pacote: ${sanitized.checked} manifestos verificados; ${sanitized.changed} arquivos higienizados.`,
);

console.log(`Pacote de deploy pronto em deploy/ (start: "${pkg.scripts.start}").`);
