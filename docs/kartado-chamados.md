# Chamados Kartado — primeira versão

A tela `/kartado/chamados` fica ao lado de Auditoria, Saúde e Acompanhamento Eco. Administradores podem cadastrar e editar chamados; usuários autenticados podem consultar. Dentro das unidades da Auditoria, a aba Chamados consulta a mesma base pelo identificador da unidade e oferece acesso ao cadastro central.

Campos: número, unidade, assunto, descrição, abertura, status, prioridade, solicitante, responsável e solução/observações. O número é único por unidade. Encerrar registra a data de fechamento; reabrir remove essa data. Os filtros e indicadores consideram a data de abertura e o status atual. A listagem tem paginação de 20 registros.

## Preparação do banco

Configure `DB_HOST`, `DB_NAME`, `DB_MIGRATION_USER` e `DB_MIGRATION_PASSWORD` no ambiente local, além de `DB_APP_USER` ou `DB_USER` para conceder acesso ao usuário da aplicação. Execute:

```powershell
npm run db:migrate-kartado-tickets
```

Publique o frontend e o backend juntos e reinicie o servidor. A migração é aditiva e pode ser executada novamente. Sem a tabela, a API retorna uma mensagem de indisponibilidade.

## Verificação

```powershell
npm run test:kartado-tickets
npm run build
```

Os testes usam PostgreSQL embarcado (PGlite), sem modificar o banco do ambiente, e verificam persistência, isolamento das consultas por unidade, duplicidade, autenticação, permissões, validação e encerramento/reabertura.

Esta versão trabalha com cadastro manual. Importação de arquivos, anexos, regras de SLA e sincronização externa ficam para versões posteriores.

## Indicadores e finalização

Ao selecionar Encerrado, informe a data e hora real de finalização. O formulário sugere o momento atual e preserva o fechamento ao editar. A API rejeita fechamento futuro ou anterior à abertura. Reabrir remove a finalização. O campo `closed_at` já existe; não é necessária nova migração.

Os filtros definem o recorte pela abertura. Finalizados representam os chamados desse recorte atualmente encerrados, mesmo que o fechamento ocorra fora do período de abertura. Pendências refletem o status atual. Escalados possuem Chamado Kartado preenchido após remover espaços. Os cartões filtram a lista e a exportação sem alterar os gráficos.

Média, mediana e faixas de resolução usam horas corridas entre abertura e fechamento, somente de encerrados com datas válidas. A idade dos pendentes usa dias corridos até o momento atual. A evolução mostra até 12 meses consecutivos até a última movimentação do recorte. Assuntos recorrentes agrupam texto exato, pois não há categoria estruturada de motivo. O percentual de SLA aguarda definição do prazo e da regra de contagem.

Verificação dos cálculos: `node scripts/test-kartado-tickets-kpis.mjs` (Node 24).

O campo **Chamado Kartado** é uma referência de texto opcional de até 100 caracteres, independente do número do chamado. Ele aparece no cadastro, edição, lista, detalhes e busca. Execute novamente a migração acima para adicionar `kartado_case_number` às bases existentes; os registros anteriores recebem texto vazio.
