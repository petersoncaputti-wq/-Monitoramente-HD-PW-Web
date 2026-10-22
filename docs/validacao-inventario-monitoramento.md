# Validação do inventário de monitoramento

Data: 20/10/2026. Parecer preliminar: aguardar homologação antes de integrar ao painel.

## Escopo e evidências

- Documento analisado: `C:/Users/Peterson/Downloads/MONITORAMENTO_INVENTARIO.md`.
- O projeto local contém o consumidor (`server/services/kartado-audit.service.mjs`), a fila de consultas e a interface anterior de apontamentos. Posteriormente foram fornecidos os três arquivos do backend: `monitoramento.router.js`, `inventario-consolidation.service.js` e `kartado.service.js`, disponíveis em `C:/Users/Peterson/Downloads`.
- `AGENTE_AUDITOR_BASE_URL` e `MONITORAMENTO_API_KEY` não estão configurados no `.env.local`. As respostas autenticadas dos novos endpoints ainda não foram consultadas. Credenciais diretas do Kartado não substituem a chave dessa integração.
- `npm run test:kartado-audit`: passou. A suíte usa respostas simuladas e PostgreSQL descartável; não comprova funcionamento na API remota.
- Reprodução isolada com o cliente real e resposta HTTP simulada `202`, `success: true`, `status: processando`, `Retry-After: 15`: `reportings()` resulta em erro 502 de contrato incompatível, sem preservar o intervalo de repetição. O cliente atual não está preparado para reutilização direta nos novos endpoints assíncronos. Não foi demonstrado que o endpoint de apontamentos existente devolva 202 em produção.
- `AuditResult` não declara `stale`, `generatedAt` ou qualidade por fonte. A interface anterior classifica parcial por `fetchFailedPages > 0`, mas não apresenta desatualização. `fromCache` não informa, sozinho, se o dado está vencido. A aba atualmente montada em `KartadoPage.tsx` usa `KartadoUnitReportings`, com consulta direta paginada; o cliente Auditor analisado permanece disponível, mas não controla essa aba. O defeito de 202 é uma limitação de reutilização daquele cliente, não evidência de falha da aba ativa.
- O horário `retrievedAt` é preenchido com a conclusão do job local. Esse horário não equivale ao instante da coleta na origem.

## Contrato proposto para qualidade

Manter dimensões independentes por fonte (`inventario` e `apontamentos`):

| Dimensão | Valores | Critério |
|---|---|---|
| Integridade da coleta | completa, parcial, desconhecida | Completa exige conclusão bem-sucedida, diagnóstico de falhas válido e ausência de truncamento conhecido. Metadado ausente significa desconhecida. |
| Atualidade | vigente, desatualizada, desconhecida | Usar expiração e instante da coleta informados pela fonte; não usar o horário de abertura do painel. |
| Atualização | ociosa, processando, falhou | Independente da qualidade do último resultado disponível. |

Os TTLs documentados são 6h para inventário e 30min para apontamentos; confirmar no backend e preferir `expiresAt` explícito. Resultado em cache pode estar completo e vigente. Resultado parcial pode também estar desatualizado. Nunca reduzir essas condições a um único indicador que esconda a outra condição.

Exigir por fonte: instante da coleta, expiração/idade, estado de atualização, páginas tentadas/concluídas/falhas, eventual truncamento, avisos e identificação da versão da coleta. Zero falhas sem diagnóstico de conclusão não prova integridade. Quantidade de páginas com falha não permite estimar a porcentagem de registros ausentes.

No cruzamento, a qualidade depende das duas fontes. Mostrar os horários de ambas e deixar explícito que apontamentos da janela são relacionados ao inventário atual, salvo comprovação de inventário histórico.

## Regras de apresentação propostas

- Completo e vigente: indicadores normais, período e última coleta visíveis.
- Completo e desatualizado: manter consulta com aviso e horário da coleta; informar atualização em andamento ou falha.
- Parcial: contagens dos registros recebidos com aviso persistente; suspender percentuais de cobertura, rankings comparativos e conclusões de ausência. Não chamar de estimativa: a perda pode ser enviesada.
- Parcial e desatualizado: mostrar as duas condições, com as fontes afetadas.
- Qualidade desconhecida: apresentar estado de verificação indisponível, sem selo de completo.
- Processando sem resultado anterior: mostrar progresso e próxima tentativa; não preencher indicadores com zero.
- Falha sem resultado anterior: exibir indisponível. Com resultado anterior: preservar seus metadados e indicar falha na atualização.
- Uma nova coleta parcial não deve apagar silenciosamente o último resultado completo. Preservar versões e informar claramente qual delas está sendo exibida.
- Exportações e detalhes devem transportar período, filtros, horários e alertas de qualidade.

## Significado dos indicadores

- Usar “Ativos com apontamento no período”, evitando afirmar que houve inspeção ou manutenção sem filtro comprovado por tipo de serviço.
- Usar “Ativos sem apontamento vinculado encontrado no período”. Mesmo no histórico completo, evitar “nunca”: podem existir registros sem vínculo ou histórico indisponível.
- Explicitar o campo de data usado na janela, fuso e limites inclusivos/exclusivos.
- Com status selecionado, definir “sem” como ausência daquele status ou ausência de qualquer apontamento; validar a escolha no backend antes de publicar.
- Percentual de ativos com apontamento = ativos distintos com ao menos um apontamento elegível / ativos do recorte. Denominador zero deve retornar “não se aplica”. Não calcular com fontes parciais.
- Separar métricas globais da concessão das métricas do recorte. Documentar se `status` afeta os totais globais.
- Separar apontamentos sem vínculo dos vinculados a ativo ausente no inventário atual. Verificar se este último grupo já está incluído em `apontamentosVinculadosAAtivo` para evitar dupla contagem.
- Abrir detalhes preservando filtros compatíveis; se o histórico do ativo incluir todo o período, anunciar a mudança antes da lista.

## Homologação pendente

1. Inspecionar os dois arquivos do backend, tratamento de cache, chaves por concessão/período, deduplicação de varreduras e comportamento entre réplicas/reinícios.
2. Consultar concessões e amostras paginadas dos quatro endpoints com a chave configurada no servidor; registrar metadados e totais sem gravar chave ou registros pessoais.
3. Validar retorno 202 e repetição respeitando `Retry-After`, incluindo `refresh=1` sem reiniciar a coleta. Consultas de estado não devem disparar atualizações sucessivas.
4. Conferir uma concessão menor e uma maior, primeiro carregamento e cache; limitar consultas simultâneas e evitar varreduras completas desnecessárias.
5. Comparar soma por classe/rodovia, categorias sem preenchimento, matriz e totais; conferir porcentagens com arredondamento e denominador zero.
6. Cruzar contagem agregada com ativos distintos nas páginas; checar duplicatas, ordenação estável e apontamentos amostrados por ativo.
7. Validar período recente/completo, status e `filtro=sem`, classe inexistente e ativo sem apontamentos. Distinguir amostra paginada de coleta incompleta.
8. Testar falha parcial, cache vencido, atualização malsucedida e recuperação em ambiente controlado ou com injeção de falhas, sem provocar falhas na produção.
9. Conferir preservação de filtros e mudança de janela no detalhamento.

## Critério de decisão

Implementação condicionada a: contrato e semântica confirmados no backend, amostras autenticadas consistentes, tratamento de 202 validado, qualidade por fonte disponível e cenários de parcial/desatualizado demonstrados. Até essas evidências, a recomendação é aguardar; não há validação real suficiente para aprovar a integração.

Nenhuma alteração funcional foi feita no painel nesta análise.

## Complemento após recebimento dos três arquivos

### Consulta real, limitada, ao Kartado

Executada com as credenciais locais existentes, sem usar a chave do Agente Auditor e sem varredura completa. Não comprova o contrato HTTP de `/api/v1/monitoramento/*`.

| Consulta | Evidência observada |
|---|---|
| Autenticação Kartado | HTTP 201, token obtido; credenciais e token não gravados no relatório. |
| Concessão amostrada | Ecovias Raposo Castello, `067c811a-1fb4-4f97-9c34-9e68125da1c1`. |
| `/Inventory/`, página 1, tamanho 2 | Dois registros; contagem da origem 17.286; atributos `number`, `roadName`, `km`, `endKm`, `imageCount`; relacionamento `occurrenceType`. Confirma estrutura esperada e contagem do documento nesse instante. |
| `/Reporting/`, página 1, tamanho 2, `found_at_after` de 365 dias | Dois registros; contagem da origem 20.562; relacionamentos `occurrenceType`, `status`, `parent`; ambos os pais de tipo `Inventory`; ambas as datas da amostra respeitavam o limite. Isso não verifica todo o conjunto. |
| `/Reporting/` com `parent` do primeiro ativo | Um registro e contagem 1; vínculo da amostra correspondia ao ativo solicitado. |

### Problemas reproduzidos sem rede

Comando: `node scripts/validate-inventory-supplied.mjs C:/Users/Peterson/Downloads`.

O script carrega os fontes fornecidos em memória e substitui somente dependências de transporte/coleta e o relógio utilizado pelo cache para controlar os cenários. Não altera os arquivos fornecidos. Os dez grupos de observações foram confirmados por asserções.

| Prioridade | Achado confirmado | Consequência e correção proposta |
|---|---|---|
| Alta | `extractPage` transforma formato desconhecido sem `errors` em zero itens e zero falhas. | Pode apresentar inventário vazio como coleta bem-sucedida. Rejeitar esquema inesperado, sem substituir resultado anterior. |
| Alta | Nova coleta parcial substitui uma coleta completa no cache e recebe TTL normal de 6h/30min. | Preservar último resultado completo e manter tentativa parcial separada, com diagnóstico próprio e política de nova tentativa. |
| Alta | Deduplicação pode produzir menos registros que a contagem da origem com `failedPages=0`. | Zero falhas não prova completude; publicar recebidos, únicos, esperados, duplicatas e mudanças de contagem. Tratar divergência como integridade não confirmada. |
| Alta | Catálogos de classes/status retornam somente `Map` e descartam falhas parciais. | Registros podem virar classe/status não informado sem aviso de coleta parcial. Propagar diagnóstico de cada catálogo; não classificar campo desconhecido como ausência real. |
| Alta | Cache vencido continua anunciando atualização em andamento após falha e durante a espera antes de tentar novamente. | Publicar `refreshState`, `lastRefreshErrorAt` e próxima tentativa; informar falha de atualização separadamente da qualidade do resultado preservado. |
| Alta | `refresh=1` deduplica somente tarefas ainda em andamento; tarefa concluída é iniciada novamente. | No cruzamento, cada fonte pode reiniciar separadamente durante polling. Preferir identificador de atualização/job; iniciar uma vez e acompanhar sem novo comando de refresh. |
| Média | `SCAN_POOL_SIZE=3` vale por varredura; duas varreduras simultâneas ocuparam as cinco conexões globais no teste. | O documento não tem garantia de duas conexões reservadas. Adicionar semáforo global compartilhado das varreduras com limite 3 ou corrigir a promessa; coordenar réplicas se houver múltiplos processos. |
| Média | Denominador zero produz 0%; metadados da consolidação descartam duplicatas removidas. | Usar percentual nulo/não aplicável sem base e transportar diagnóstico completo. |

### Semântica esclarecida pelo código

- `status=Programado&filtro=sem` inclui ativo que tem apenas apontamento Executado. O significado é “sem apontamento Programado encontrado”, e não “sem qualquer apontamento”.
- Os grupos `apontamentosVinculadosAAtivo`, `apontamentosSemVinculo` e `apontamentosAtivoForaDoInventario` são separados. O primeiro conta apenas vínculos encontrados no inventário carregado.
- Esses três grupos são globais da concessão, sem aplicar filtros de classe/rodovia/status. Já `apontamentosNoRecorte` e ativos com apontamento respeitam os filtros. `apontamentosForaDoFiltroStatus` considera somente vínculos a ativos encontrados no inventário, ainda sem recorte de classe/rodovia.
- A contagem global `apontamentosNaJanelaConcessao` vem da contagem da origem; os grupos são calculados sobre registros recebidos. Havendo perda, sua soma pode divergir da contagem global.
- Um pai não encontrado no inventário carregado pode estar ausente por falha de coleta. O texto atual “não está mais no inventário” e o exemplo de exclusão são conclusões que a coleta parcial não sustenta. Preferir “vínculo não localizado no inventário coletado”.
- O período recente é calculado como 365 dias, com corte em data UTC e filtro `found_at_after`; não é necessariamente 12 meses de calendário. O serviço não comprova por si só que `foundAt` seja a data de criação administrativa. Validar seu significado com o Kartado e rotular pela regra confirmada.
- O cruzamento usa inventário atual e apontamentos históricos, não a fotografia do inventário na data de cada apontamento.
- `/itens` retorna UUID e paginação, esclarecendo a omissão da documentação. O detalhamento do ativo não aplica janela/status e pode diferir do agregado por ter coleta em outro momento.
- Classe/rodovia sintéticas “não informada” funcionam na agregação, mas não têm filtro equivalente comprovado na consulta direta de detalhes. Uma classe sintética pode retornar 404 em `/itens`; classes com nomes iguais podem agrupar vários UUIDs no resumo, enquanto `/itens` escolhe o primeiro UUID encontrado. Validar ou alterar a navegação.
- Os caches e tarefas estão em memória por processo. Não há persistência nem coordenação entre réplicas nesses arquivos. Reinício perde os dados e as tarefas; o mesmo polling pode alcançar processos com estados diferentes.
- O router fornecido não aplica autenticação internamente. O comentário menciona middleware externo; é necessário conferir montagem e `monitoramentoAuth.js` antes de validar proteção e comparação da chave.

### Parecer atualizado

A amostra real confirma campos, relacionamento e contagem de inventário citada. Os testes do código confirmam problemas de qualidade que podem induzir conclusões incorretas, mesmo com HTTP 200. Recomenda-se corrigir o contrato/fluxo do backend antes de aprovar o cruzamento no painel. Ainda faltam consultas autenticadas ao Agente Auditor e homologação dos cenários controlados de falha, desatualização e recuperação na versão corrigida.
