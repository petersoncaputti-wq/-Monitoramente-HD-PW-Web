# Prévia local do Inventário

Para validar a proposta de interface antes da integração ao painel:

```powershell
npm run preview:inventario
```

Abra http://127.0.0.1:5184/inventario-preview.html na mesma máquina. O servidor escuta apenas no endereço local e pode ser encerrado com Ctrl+C.

A tela usa uma entrada React independente, com dados fictícios e sem autenticação ou consultas às APIs. Nenhuma alteração foi feita na navegação do painel. O build normal continua usando apenas `index.html`; a entrada da prévia não é incluída na publicação normal.

## Fluxos para avaliar

1. Trocar a unidade e filtrar classe/rodovia no resumo.
2. Alternar a distribuição por classe e rodovia; abrir um grupo e selecionar um ativo.
3. Abrir “Consultar cruzamento” e alternar o período/status. Os indicadores de presença continuam contando qualquer status; os valores do status selecionado aparecem separadamente.
4. Escolher “Por ativo”, filtrar com/sem apontamento, buscar e paginar.
5. Abrir o histórico de um ativo. A tela avisa que o histórico inclui registros fora do período/status do cruzamento.
6. No seletor “Simular cenário”, experimentar coleta parcial, desatualização, atualização em andamento, falha, primeira coleta em andamento e inventário vazio.

A primeira coleta em andamento é um estado ilustrativo, sem polling real. O botão “Simular atualização” exibe o estado por aproximadamente dois segundos e retorna ao cenário completo. Os links para o Kartado serão adicionados na integração real; a amostra não inventa links para ativos inexistentes.

Os totais são calculados sobre os ativos da amostra: 48 na primeira unidade e 36 na segunda, com 75% dos ativos recebidos no cenário parcial. A data de referência é 22/10/2026; o período recente usa os últimos 365 dias. A unidade vazia é um retorno completo com zero registros, distinto de coleta ainda em andamento.

## Verificação

`npm run build` passou. O HTML da prévia e seu módulo React responderam HTTP 200 no servidor local. A renderização inicial do componente React também passou em uma verificação isolada. A entrada da prévia não aparece nos artefatos do build normal. A ferramenta de navegação desta sessão não disponibilizou navegadores; a conferência visual no navegador fica para a validação local.
