# Painel Operacional ProjectWise

Base inicial de um painel front-end para importar planilhas operacionais do ProjectWise e visualizar uma prévia dos dados.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- SheetJS (`xlsx`)
- Recharts

## Estrutura

- `src/components`: componentes reutilizaveis da interface
- `src/pages`: paginas da aplicacao
- `src/services`: servicos de leitura e transformacao
- `src/types`: tipos TypeScript dos dados
- `src/utils`: utilitarios auxiliares

## Como executar

1. Instale o Node.js 18+.
2. Rode `npm install`.
3. Rode `npm run dev`.

## Como testar a importacao

1. Inicie a aplicacao.
2. Use o link "Baixar arquivo de exemplo para teste" na propria tela.
3. Importe o arquivo `modelo-monitoramento.xml`.
4. Confira o nome do arquivo, a quantidade de linhas lidas e a prévia exibida na tela.

Observação: o importador aceita `.xlsx`, `.xls`, `.csv` e `.xml` compatíveis com o Excel e sempre lê a primeira aba.

## Fonte automática da aba Armazenamento

Para manter a aba de armazenamento atualizada sem upload manual, salve a planilha diária em:

`public/dados/armazenamento.xlsx`

Ao abrir o painel, o sistema tenta carregar automaticamente esse arquivo. O botão "Atualizar armazenamento" refaz a leitura da fonte padrão. Se necessário, também são aceitos os nomes `armazenamento.xls`, `armazenamento.csv` e `armazenamento.xml` na mesma pasta.

Também é possível apontar para uma URL externa, como um link público de download do OneDrive. Crie um arquivo `.env.local` na raiz do projeto com:

```env
VITE_STORAGE_SOURCE_URL=https://exemplo/arquivo.xlsx
```

Depois reinicie o servidor com `npm run dev`. Em build de produção, rode `npm run build` novamente após alterar essa variável.

Para OneDrive, prefira um link que baixe o arquivo diretamente. Links que exigem login ou abrem uma página de visualização podem ser bloqueados pelo navegador ou lidos como HTML, não como planilha.

Se você já usa uma pasta do OneDrive sincronizada no Windows, configure a cópia local da planilha:

```env
STORAGE_SYNC_SOURCE_PATH=C:\Users\Peterson\OneDrive - Grupo Ecorodovias\Área de Trabalho\analise_armazenamento.xlsx
```

O comando `npm run sync:storage` copia essa fonte para `public/dados/armazenamento.xlsx`. Os comandos `npm run dev` e `npm run build` também fazem essa cópia automaticamente antes de iniciar.

Durante o uso local com `npm run dev`, o botão "Atualizar armazenamento" também executa essa sincronização antes de reler os dados. Em publicações estáticas, como Vercel, esse endpoint local não existe; nesse caso o botão apenas relê a fonte já publicada.

Se o painel estiver sendo usado a partir da pasta `dist`, mantenha a mesma planilha em `dist/dados/armazenamento.xlsx` ou gere um novo build depois de atualizar o arquivo em `public/dados`.

O upload manual continua disponível para testes ou correção pontual.
