# Upgrade da aba Apontamentos

## Consulta completa por unidade

A aba do painel agora utiliza diretamente `POST /api/v1/kartado/reportings/page`, com as credenciais Kartado do servidor e a autenticação do portal. Ao abrir, percorre todas as páginas de 100 registros, sem filtro de origem ou data, com progresso e deduplicação por identificador. A primeira página descobre o total; as demais são carregadas em lotes de até três chamadas simultâneas. Falhas de rede e HTTP 408/429/500/502/503/504 recebem até duas novas tentativas com espera crescente (ou Retry-After). Uma página com falha persistente é sinalizada e as demais continuam. HTTP 401/403 e 429 persistente interrompem novos lotes. Mudanças no total e registros duplicados também impedem marcar o resultado como completo. As rotas do Auditor abaixo permanecem disponíveis, mas não controlam mais esta aba.

Os filtros são locais e atualizam os seis cards, gráficos e tabela. Norte/Sul representam o sentido de tráfego (`direction`, ou seu equivalente normalizado `sentido`), conforme a regra definida para o painel. Outros valores ficam como não identificados na distribuição Norte/Sul. A natureza utiliza `natureza`/`nature` e, na ausência, `occurrenceKind`/`occurrence_kind`; a classe continua separada em `occurrenceType`. Consultas incompletas são sinalizadas, inclusive quando a contagem muda durante o carregamento. Sair da aba interrompe o carregamento; consultas completas são reutilizadas por cinco minutos na sessão da página (até cinco unidades). Atualizar ignora esse cache.

Validação: `node scripts/test-kartado-unit-reportings.mjs`, `npm run test:kartado-audit` e `npm run build`. Validar também em uma sessão autenticada com uma unidade de grande volume.

## Integração anterior com o Auditor

A nova aba usa o Agente Auditor para consultar uma origem por vez. A ativação é explícita por `KARTADO_REPORTINGS_PROVIDER=auditor`; sem essa configuração, o painel conserva o provedor anterior. Usuários, saúde, fotos e os indicadores gerais continuam na integração Kartado existente. Os totais da consulta não substituem os totais gerais da concessão.

## Configuração e publicação

1. Aplique `azure/kartado-audit-schema.sql` no mesmo PostgreSQL do painel. O comando `npm run db:migrate-kartado-audit` carrega `.env.local`; no SSH do Azure, com as variáveis já disponíveis, use `node scripts/migrate-kartado-audit.mjs`. A conta de migração precisa criar a tabela e conceder permissões à conta da aplicação (`DB_APP_USER` ou `DB_USER`).
2. Configure somente no servidor:
   - `AGENTE_AUDITOR_BASE_URL=https://ecorodovias-agent-api-prod.azurewebsites.net`
   - `MONITORAMENTO_API_KEY`: chave vigente fornecida pelo responsável pela integração. Não use o prefixo `VITE_` nem registre a chave no repositório.
   - `KARTADO_REPORTINGS_PROVIDER=auditor`.
3. Execute `npm run test:kartado-audit` e `npm run build`, publique pelo processo existente e reinicie a aplicação.
4. Mantenha o processo Node ativo no App Service (Always On) para processar a fila. A fila e os resultados ficam no PostgreSQL, acessíveis entre réplicas. Cada processo executa uma busca por vez, com limite global de duas buscas. O lock transacional PostgreSQL coordena as réplicas.
5. Valide com uma sessão autenticada: Capixaba/TRO, outra concessão, resultado vazio, filtros locais, consulta parcial e reabertura da aba durante a busca. Teste também uma concessão grande antes de ampliar o uso.

O workflow da branch `azure-migration` executa os testes de apontamentos antes do build e da publicação. Ele não aplica a migração nem configura os segredos do App Service automaticamente.

## Chamadas internas

Todas as rotas em `/api/kartado-audit` exigem sessão ativa e usam `Cache-Control: no-store`.

- `GET /config`: provedor e presença da configuração, sem segredos.
- `GET /concessoes`: lista do Agente Auditor.
- `GET /origens?concessao=<uuid>`: sugestões por amostra.
- `POST /jobs`: `{concessao, origem, periodo: "recente"|"completo", refresh: boolean}`; responde `202` com o ID da consulta.
- `GET /jobs/:id`: estado da consulta, somente para o usuário que a iniciou.
- `GET /jobs/active`: recupera a busca ativa do usuário, mesmo quando a resposta inicial foi interrompida antes de salvar o ID no navegador.
- `GET /jobs/:id/result`: resultado concluído, somente para o usuário que o iniciou.

A consulta pesada roda no backend, sem manter aberta a conexão do navegador. A tela consulta o andamento a cada três segundos e lembra o ID na sessão do navegador para retomar ao voltar à aba. Fechar a aba não cancela uma busca já iniciada. Resultados expiram após uma hora. Uma busca tem timeout de 15 minutos; jobs interrompidos por reinício são marcados como falhos após 16 minutos. Jobs esperando na fila expiram após 20 minutos. Nenhuma busca pesada é repetida automaticamente, inclusive após erro parcial; a repetição sem cache é explícita.

## Regras e limites da primeira versão

- Origem obrigatória e exata. O contrato não oferece “Todas as origens”. Sugestões não são exaustivas; digitação livre permanece disponível.
- Período recente: últimos 12 meses conforme a API. Histórico completo exige seleção e clique em Buscar.
- Datas locais filtram `dataCriacao` dentro dos registros recebidos; não equivalem a `foundAt` e não ampliam a janela consultada. Registros sem data são excluídos quando um filtro de data está ativo.
- `fetchFailedPages > 0` sinaliza resultado parcial na lista e em todos os indicadores, inclusive em cache. Zero registros num resultado parcial não confirma ausência de ocorrências.
- As exclusões são exibidas a partir de `naturezasExcluidas`; não são recriadas no frontend. Trecho só aparece com `trechoDisponivel=true`.
- Pendentes: Identificado, Em Execução, Pendente, Aberto ou Em andamento, sem data de execução. Concluídos: Executado, Concluído, Encerrado ou Finalizado. Outros status não são presumidos pendentes. Essa classificação explícita fica acessível na tela e deve ser confirmada pelo responsável operacional.
- Vencidos são pendentes com prazo anterior ao dia atual em Brasília; vencimento hoje, prazo ausente, cancelados e executados não entram nessa contagem.
- O histórico completo não tem garantia de terminar em 15 minutos. Para ampliar essa cobertura, solicitar ao Agente Auditor um contrato assíncrono próprio, paginação e filtros de data/origem mais flexíveis.
- Os resultados ficam limitados a 40 MiB para persistência. Mapas e exportações não fazem parte desta entrega.

## Reversão

Configure `KARTADO_REPORTINGS_PROVIDER=legacy`, reinicie e recarregue a página. Isso restaura explicitamente a aba anterior. Não há fallback automático: a consulta antiga é uma amostra e o filtro de origem não foi respeitado no teste de integração. A tabela de jobs pode permanecer; não é necessário apagar dados para reverter.

### Diagnóstico de falhas em grandes consultas

A rota de página registra unidade, página, etapa (authentication/kartado/normalization), status HTTP e duração, sem tokens ou corpo externo. O status 500 isolado não permite identificar a causa histórica; é necessário correlacionar esses registros com uma nova consulta. O teste automatizado simula 21.200 registros e uma página com HTTP 500 persistente. Não substitui teste de desempenho contra o Kartado real.

### Recuperação de páginas com HTTP 500

Quando uma página de 100 registros falha com HTTP 500, a consulta direta divide o mesmo intervalo ordenado por UUID em blocos de 25, 5 e finalmente 1 registro. A recuperação tem limite de 20 chamadas por página; outros erros são propagados normalmente. Registros que ainda falham individualmente são informados em `failedRecords` (posições na consulta, não UUIDs). A página permanece parcial, não entra no cache de resultados completos e os registros recuperáveis são preservados.

Teste real em 02/10/2026, Ecovias Capixaba: página 312 retornou HTTP 500; a recuperação retornou 99 registros e isolou a posição 31.117 com HTTP 500, com total informado de 34.187. O conteúdo desse registro não foi retornado pela API, portanto a causa interna depende de investigação do Kartado.
