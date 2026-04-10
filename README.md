# Painel de Monitoramento de Armazenamento

Base inicial de um painel front-end para importar planilhas de monitoramento de disco e visualizar uma previa dos dados.

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
4. Confira o nome do arquivo, a quantidade de linhas lidas e a previa exibida na tela.

Observacao: o importador aceita `.xlsx`, `.xls`, `.csv` e `.xml` compativeis com o Excel e sempre le a primeira aba.
