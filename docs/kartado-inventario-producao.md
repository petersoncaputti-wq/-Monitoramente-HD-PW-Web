# Inventário no painel Kartado

A aba **Inventário** aparece dentro da unidade selecionada, ao lado de **Apontamentos**. A tela aprovada na prévia foi implementada com dados reais: resumo, filtros por classe/rodovia, cruzamento sob demanda, período/status, lista paginada de ativos e histórico completo do ativo. A entrada de demonstração continua independente e não entra no build normal.

## Integração

O navegador consulta `/api/kartado-inventory/*`, com sessão ativa do portal. O adaptador de servidor consulta os quatro endpoints de inventário de `/api/v1/monitoramento/*` no Agente Auditor. A chave nunca vai ao navegador. Respostas antigas sem `coleta` e `coletaCompleta` são recusadas, evitando apresentar números sem diagnóstico de integridade.

Configure no App Service do painel, somente no servidor:

```env
AGENTE_AUDITOR_BASE_URL=https://ecorodovias-agent-api-prod.azurewebsites.net
MONITORAMENTO_API_KEY=<chave vigente da integração>
```

São as mesmas variáveis da integração anterior do Auditor; não é necessário mudar `KARTADO_REPORTINGS_PROVIDER`. Não há migração de banco para esta aba.

O primeiro acesso pode retornar 202. A tela respeita `Retry-After` e acompanha a mesma consulta até concluir. As requisições e esperas do navegador são canceladas quando o último consumidor sai; a coleta já iniciada continua no serviço de origem. Com resultado anterior e atualização em andamento, os dados e metadados permanecem visíveis enquanto a tela acompanha o estado. O acompanhamento tem limite de 15 minutos; após isso o usuário pode consultar novamente. Uma atualização manual respeita intervalo de cinco minutos.

## Reaproveitamento e antecipação no portal

Abrir o modal de uma unidade antecipa o resumo dessa unidade e, após sua conclusão, o cruzamento padrão por classe dos últimos 365 dias, sem filtros. Não são antecipados o histórico completo nem outras unidades. A aba Inventário compartilha a consulta e o acompanhamento em andamento, recebendo imediatamente a última etapa de processamento conhecida. Fechar o modal ou trocar de unidade cancela a antecipação anterior. Sair apenas da aba pode manter a antecipação enquanto o modal continuar aberto.

O cache é uma instância em memória da página Kartado, limitada a 80 consultas de resumo/cruzamento e descartada ao sair da página. As chaves separam unidade, caminho e filtros e normalizam os parâmetros padrão do cruzamento. A lista de ativos aberta a partir do cruzamento também utiliza esse cache. Resultados completos, válidos e sem atualização pendente podem ser reutilizados sem rede durante 60 segundos. Depois disso, o resultado anterior aparece imediatamente e uma consulta verifica o estado atual. Coletas parciais, expiradas ou com falha de atualização sempre são verificadas novamente; a idade e a expiração dos dados exibidos consideram o tempo no cache.

Atualizar inventário invalida os resultados da unidade e envia `refresh=1` apenas pelo resumo base, evitando disparar a mesma atualização pelas consultas filtradas. Respostas iniciadas antes da invalidação não substituem o cache atualizado. Falhas não são armazenadas como sucesso e preservam o último resultado disponível.

As respostas bem-sucedidas e 202 de `/api/kartado-inventory/*` incluem `Server-Timing: inventory;dur=...`, com o tempo em milissegundos da consulta ao banco ou ao adaptador/Agente Auditor. Esse tempo pode ser inspecionado na aba Network do navegador por endpoint; não mede a duração total de uma coleta acompanhada por várias requisições. Não houve medição autenticada em produção nesta alteração.

## Ordem de publicação

### Persistência dos agregados no painel

O portal agora pode salvar no PostgreSQL o resumo sem filtros e o cruzamento recente (365 dias) por classe e rodovia. Não salva o catálogo completo nem atende filtros específicos, histórico completo ou detalhes por esse mecanismo. As consultas autenticadas continuam obrigatórias; a chave da origem permanece no servidor.

Antes de publicar esta versão, executar `npm run db:migrate-kartado-inventory` com as credenciais de migração configuradas em `.env.local` (ou `node scripts/migrate-kartado-inventory.mjs` com variáveis no ambiente). A migração cria `kartado_inventory_snapshots` e concede acesso ao usuário da aplicação. `KARTADO_INVENTORY_SNAPSHOTS=false` desativa a funcionalidade. Sem a tabela ou em falha do banco, as requisições usam o adaptador direto anterior.

Consultar o resumo de uma unidade registra os três agregados para preparação. O worker do portal roda a cada cinco segundos, processa um agregado por vez por instância e renova os resultados em até dez minutos, antecipando a próxima tentativa se a validade da origem terminar antes. Um 202 respeita `Retry-After`; falhas aguardam cinco minutos e preservam o último resultado. Cada trabalho tem lease de 90 segundos e token, evitando execução simultânea do mesmo agregado entre réplicas e gravações de workers antigos. Repetir `refresh=1` no polling não reinicia atualizações durante o intervalo de cinco minutos.

Resultados completos anteriores são preservados quando uma nova tentativa é parcial. Idade, expiração, processamento e falhas são apresentados usando os metadados da coleta. O tempo em `Server-Timing` agora inclui o caminho efetivamente utilizado (banco ou origem), não apenas o Agente Auditor. As unidades acessadas nos últimos sete dias continuam sendo preparadas sem navegador aberto, desde que o processo do servidor esteja ativo. A primeira coleta de uma unidade sem resultado persistido ainda depende da origem. Reinícios e réplicas compartilham os agregados no banco.

Validar com Ecovias Capixaba: aguardar a primeira coleta completa, fechar a tela, reabrir o cruzamento padrão e verificar resposta do snapshot; repetir após reiniciar o portal. Conferir atualização, falha e coleta parcial, preservando o resultado completo. O código atual do Agente Auditor não foi alterado. Na execução local desta alteração, a migração não pôde ser aplicada por ausência de credenciais do banco; os testes usam PostgreSQL embutido (PGlite) e transporte simulado, sem medição autenticada em produção.

1. No repositório do Agente Auditor, aplicar os arquivos corrigidos de `Downloads` nos caminhos correspondentes a `backend/routes/monitoramento.router.js`, `backend/services/inventario-consolidation.service.js` e `backend/services/kartado.service.js`. Ajustar os caminhos se a estrutura do repositório diferir. Preservar a montagem existente da autenticação.
2. Executar a validação do backend corrigido e publicar pelo fluxo desse serviço. Confirmar que os endpoints autenticados retornam o contrato de 22/10/2026.
3. Confirmar a configuração das duas variáveis no App Service do painel.
4. Executar `npm run test:kartado-inventory`, os testes de regressão e `npm run build`.
5. Publicar o painel pelo workflow de `azure-migration`. A publicação é disparada por push nessa branch.
6. Conferir a execução do GitHub Actions, a saúde da aplicação e a nova aba em uma sessão autenticada.

Nenhum push/deploy deve ser considerado concluído apenas porque o build local passou. O Agente Auditor e o painel são serviços diferentes.

### Conferência do backend publicado em 22/10

Os três arquivos baixados do Kudu, com sufixo `(1).js`, já contêm a revisão de confiabilidade do contrato. Eles não são equivalentes aos originais de 20/10 preservados no backup inicial. Uma cópia com ajustes incrementais foi preparada em `C:/Users/Peterson/Downloads/backend-azure-corrigido`, preservando a interface atual dos catálogos (`names`, `completo`, `esperados`, `recebidos`).

Somente os dois arquivos de `services` dessa nova pasta precisam ser substituídos em `/home/site/wwwroot/services/`: `kartado.service.js` e `inventario-consolidation.service.js`. O `monitoramento.router.js` da cópia é idêntico ao baixado do Azure e não precisa ser reenviado. Depois da troca, reiniciar o App Service do Agente Auditor para carregar os módulos atualizados.

Os ajustes incrementais cobrem percentuais sem denominador, nomes não resolvidos, validação numérica da paginação, formato inválido em páginas posteriores, deduplicação em página única, semáforo compartilhado das varreduras e limpeza de timers. A validação isolada executou 18 grupos, incluindo compatibilidade das respostas reais da consolidação com o adaptador do painel:

```powershell
node scripts/validate-inventory-corrected.mjs C:/Users/Peterson/Downloads/backend-azure-corrigido
```

Isso verifica código com transporte simulado; não comprova que o upload/reinício do Azure ocorreu nem substitui a consulta autenticada ao serviço publicado.

## Validação

### Mapa de apontamentos na visão geral

A visão geral de cada unidade inclui um mapa abaixo dos indicadores. O período inicial é de 30 dias pela data em que o apontamento foi encontrado (`found_at_after`/`found_at_before`), independente dos filtros gerais da unidade. Datas do mapa são aplicadas por botão; status, classe e rodovia filtram os registros recebidos. O período máximo é de 366 dias.

`GET /api/kartado-reporting-map` exige sessão e valida unidade, datas e página. Consulta `/Reporting/` com Basic e campos esparsos em snake_case (incluindo `point`, `road_name`, `found_at`, `occurrence_type`), sem baixar formulário ou imagens. Página fixa de 200 registros, até três consultas simultâneas no navegador, subordinadas ao semáforo global do servidor. Até 100 páginas por consulta; além disso, o resultado é parcial e solicita redução do período. Respostas de outra unidade ou fora do período são recusadas. Catálogos de classe/status são reaproveitados por cinco minutos e falhas de resolução são informadas.

O mapa usa Leaflet e agrupamento de marcadores, com módulos carregados sob demanda, inserção dos pontos em lotes e cores por status. Clicar em um grupo aproxima o mapa; clicar no marcador mostra número, classe, status, rodovia e km e permite abrir a ficha interna. A camada base é OpenStreetMap, com atribuição e política de referência explícita. Nenhuma chave nova é necessária. Registros também podem ser abertos pela lista paginada, inclusive os sem coordenadas, permitindo consulta por teclado e em falhas da camada de mapa.

As contagens distinguem recebidos/total no período, pontos após filtros e registros sem coordenadas válidas. O carregamento é progressivo e informa falhas parciais. Consultas completas ficam em memória na página por cinco minutos (até cinco recortes), descartadas ao sair da página. Trocar de unidade ou aba cancela a consulta do navegador; imagens e fichas completas só são carregadas quando solicitadas. Não há migração de banco adicional para o mapa.

Validação real em 23/10/2026, período 24/09 a 23/10: Ecovias das Gerais retornou 20 registros com coordenadas e nomes resolvidos; Ecovias Capixaba informou 12.170 registros em 61 páginas e retornou 200 pontos na primeira página em aproximadamente 3,4 segundos na execução local. Isso mede a primeira página e os catálogos, não toda a consulta nem o tempo de renderização do navegador. `scripts/test-kartado-reporting-map.mjs` cobre parâmetros, isolamento, coordenadas, catálogos, concorrência, paginação progressiva, falha parcial, cancelamento e autenticação, e faz parte de `npm run test:kartado-inventory`.

### Consulta da ficha

No histórico de um ativo, **Ver ficha do apontamento** abre informações e arquivos no próprio painel. O número na tabela da aba Apontamentos e o botão da consulta de auditoria também abrem essa ficha em um modal interno, usando a unidade do resultado consultado. O modal fecha por botão ou Esc e restaura o foco e a posição da tela anterior. A consulta detalhada usa a API pública `GET /Reporting/` com Basic, `company`, `uuid`, `page=1` e `page_size=1`. O endpoint direto `/Reporting/{uuid}/` retornou 403 na verificação, enquanto a listagem filtrada retornou o registro correto. O parâmetro `include` não é suportado; equipe, classe/formulário, status e inventário são resolvidos por listagens filtradas, com limite global de cinco chamadas. A autenticação JWT das consultas anteriores não foi alterada.

As novas rotas `/api/kartado-reporting-details/:uuid` e `/:uuid/arquivos` exigem sessão do portal. Usam as variáveis existentes `KARTADO_USERNAME`, `KARTADO_PASSWORD` e `KARTADO_API_URL`, sempre no servidor. UUID e unidade são conferidos na resposta; arquivos de outro apontamento são recusados. Falhas em catálogos opcionais geram avisos sem ocultar a ficha principal. Não há migração adicional para essa ficha.

O formulário exibe os valores preenchidos com nomes e opções da classe, incluindo especificação manual. Coordenadas aparecem como latitude/longitude, sem conversão presumida para UTM. A aba de arquivos é carregada sob demanda em páginas de 20, com imagens no painel e endereços HTTPS temporários fornecidos pelo Kartado. Atualizar ficha renova a consulta. Mensagens e histórico de alterações não foram integrados.

A ficha inclui um mapa interativo OpenStreetMap com marcador nas coordenadas GeoJSON do apontamento, respeitando a ordem longitude/latitude recebida. O mapa usa um iframe com carregamento sob demanda, controles de zoom e atribuição visível; não exige chave de API. As coordenadas são enviadas ao OpenStreetMap para exibir o mapa. Coordenadas ausentes, inválidas ou fora da área da projeção suportada exibem mensagem, sem geocodificação por km ou substituição pela posição do inventário. A disponibilidade da camada depende do serviço externo.

Validação real em 23/10/2026: unidade Ecovias das Gerais (`882c7a1a-bfb2-4766-9993-90eeead59662`), apontamento `00014854-55d0-41ca-873d-09c76b6613b3`, número `EDG-MONI-2026.04223`. A consulta normalizada confirmou Cadastro Inicial, Monitoração de Sinalização Vertical, Executado, inventário `EDG-INV-2026.05452`, 62 campos preenchidos e uma imagem. Os dados de tipo de ativo, identificação R-01, campanha inicial, inspeção periódica e fabricante RODOPLEX correspondem às capturas fornecidas. Não houve conferência visual em navegador automatizado.

`npm run test:kartado-inventory` também executa `scripts/test-kartado-reporting-details.mjs`, cobrindo Basic, filtros por unidade/UUID, normalização do formulário, valores zero/falso, rejeição de respostas de outro registro, URLs de arquivos, erros parciais e autenticação das rotas.

`npm run test:kartado-inventory` exercita parâmetros, contrato atualizado, rejeição do contrato antigo, isolamento de credenciais, coleta parcial, métricas por status, detalhes paginados, sessão obrigatória, respostas HTTP e polling/cancelamento do cliente real do frontend. O workflow de publicação inclui essa suíte.

Homologação autenticada: resumo de uma unidade menor e uma maior; primeira coleta; filtros de classe/rodovia; status sem alterar presença; `Sem apontamento` apenas com ambas as fontes completas; detalhes com aviso de histórico completo; atualização/falha preservando dados; estados parcial e vazio. Não interpretar vínculo não localizado como exclusão do ativo.

Os caches do backend corrigido permanecem em memória por processo. Em múltiplas réplicas, verificar afinidade de sessão ou coordenação compartilhada para o acompanhamento de tarefas. As categorias sem identificação e classes com nomes duplicados mantêm as limitações de detalhamento do contrato da origem.

Para reverter o painel, restaurar a versão anterior pelo processo de publicação existente. A aba nova não altera as consultas de Usuários, Apontamentos ou Saúde.
