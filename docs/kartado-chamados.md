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

Esta versão trabalha com cadastro manual. Importação de arquivos, anexos, SLA e sincronização externa ficam para versões posteriores.
