# Painel de Indicadores de Sistemas de Engenharia

Painel web (ProjectWise, Kartado e indicadores operacionais) com backend Express e
dados no Azure Database for PostgreSQL, publicado no Azure App Service.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts, Leaflet, SheetJS (`xlsx`)
- Backend: Node.js 26, Express 5, PostgreSQL (`pg`), login local e SAML (Microsoft Entra ID)

## Estrutura

- `src/`: frontend (`components`, `pages`, `services`, `types`, `utils`)
- `server/`: backend Express (`routes`, `services`, `parsers` de importação)
- `azure/`: schemas e migrações SQL do PostgreSQL
- `scripts/`: testes (`test-*.mjs`), migrações, utilitários e montagem do pacote de deploy
- `vendor/`: dependências guardadas no repositório (ex.: `xlsx` 0.20.3 oficial da SheetJS)
- `docs/`: documentação de integrações e procedimentos

## Como executar

1. Instale o Node.js 26.
2. Rode `npm install`.
3. Crie `.env.local` com as credenciais `DB_HOST`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`, `DB_PORT` e `DB_SSL` do banco de desenvolvimento (veja `.env.example`).
4. Rode `npm run dev`. Esse comando inicia o backend (porta 8080) e o Vite juntos;
   o Vite encaminha todas as rotas `/api` para o backend.

## Testes e verificação

| Comando | O que faz |
|---|---|
| `npm test` | Roda todos os `scripts/test-*.mjs` (testes novos entram automaticamente) |
| `npm test -- auth saml` | Roda só os testes cujo nome contém `auth` ou `saml` |
| `npm run typecheck` | Verifica os tipos do frontend (`tsc -b`) |
| `npm run check:syntax` | Verifica a sintaxe de todo o JavaScript do servidor |
| `npm run lint` | ESLint em todo o projeto: erros (bugs prováveis) falham; avisos não bloqueiam |
| `npm run format` | Formata o projeto com o Prettier |
| `npm run format:check` | Verifica a formatação (a CI falha se algo estiver fora do padrão) |
| `npm run check` | Sintaxe, lint, tipos e testes, na ordem usada pela CI |

Para o `git blame` ignorar commits só de formatação, rode uma vez:
`git config blame.ignoreRevsFile .git-blame-ignore-revs` (o GitHub já faz isso sozinho).

Os testes `test-totvs*.mjs` que exigem exportações reais do TOTVS são ignorados
pelo `npm test`; rode-os manualmente passando o arquivo, por exemplo
`node scripts/test-totvs.mjs caminho/do/arquivo.zip`.

### Deploy

Todo push na branch `azure-migration` dispara o workflow do GitHub Actions:
verificação de dependências, sintaxe, tipos, testes, build, deploy no Azure App
Service e verificação de `/api/health`. Se qualquer verificação falhar, nada é
publicado. Executar o workflow manualmente em outra branch roda só as
verificações e o build, sem deploy.

O pacote publicado é montado por `scripts/prepare-deploy.mjs` (só o necessário em
produção). O App Service executa `npm ci --omit=dev && npm start` a cada
inicialização com npm 12, que recusa dependências por URL ou git: use sempre o
registro npm ou um arquivo em `vendor/` (`file:vendor/...`).

## Como testar a importacao

1. Inicie a aplicacao.
2. Use o link "Baixar arquivo de exemplo para teste" na propria tela.
3. Importe o arquivo `modelo-monitoramento.xml`.
4. Confira o nome do arquivo, a quantidade de linhas lidas e a prévia exibida na tela.

Observação: o importador aceita `.xlsx`, `.xls`, `.csv` e `.xml` compatíveis com o Excel e sempre lê a primeira aba.

## Fontes de dados

Todas as abas leem do PostgreSQL pelo backend (`/api/data/*`):

- **Armazenamento:** o coletor envia cada leitura para `POST /api/storage-readings`
  (veja [docs/coletor-armazenamento.md](docs/coletor-armazenamento.md)); administradores
  também podem importar o CSV diário pela tela.
- **Usuários ProjectWise / E365 e chamados:** importação de planilhas pela tela (administradores).
- **Kartado:** consultas à API do Kartado e ao Agente Auditor feitas pelo backend.
