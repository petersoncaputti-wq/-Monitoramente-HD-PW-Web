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

Abrir o modal de uma unidade antecipa somente o resumo dessa unidade. A aba Inventário compartilha a consulta e o acompanhamento em andamento. Fechar o modal ou trocar de unidade cancela a antecipação anterior. Sair apenas da aba pode manter a antecipação enquanto o modal continuar aberto.

O cache é uma instância em memória da página Kartado, limitada a 80 consultas de resumo/cruzamento e descartada ao sair da página. As chaves separam unidade, caminho e filtros. Resultados completos, válidos e sem atualização pendente podem ser reutilizados sem rede durante 60 segundos. Depois disso, o resultado anterior aparece imediatamente e uma consulta verifica o estado atual. Coletas parciais, expiradas ou com falha de atualização sempre são verificadas novamente; a idade e a expiração dos dados exibidos consideram o tempo no cache.

Atualizar inventário invalida os resultados da unidade e envia `refresh=1` apenas pelo resumo base, evitando disparar a mesma atualização pelas consultas filtradas. Respostas iniciadas antes da invalidação não substituem o cache atualizado. Falhas não são armazenadas como sucesso e preservam o último resultado disponível.

As respostas bem-sucedidas e 202 de `/api/kartado-inventory/*` incluem `Server-Timing: inventory;dur=...`, com o tempo em milissegundos da consulta ao adaptador/Agente Auditor. Esse tempo pode ser inspecionado na aba Network do navegador por endpoint; não mede a duração total de uma coleta acompanhada por várias requisições. Não houve medição autenticada em produção nesta alteração.

## Ordem de publicação

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

`npm run test:kartado-inventory` exercita parâmetros, contrato atualizado, rejeição do contrato antigo, isolamento de credenciais, coleta parcial, métricas por status, detalhes paginados, sessão obrigatória, respostas HTTP e polling/cancelamento do cliente real do frontend. O workflow de publicação inclui essa suíte.

Homologação autenticada: resumo de uma unidade menor e uma maior; primeira coleta; filtros de classe/rodovia; status sem alterar presença; `Sem apontamento` apenas com ambas as fontes completas; detalhes com aviso de histórico completo; atualização/falha preservando dados; estados parcial e vazio. Não interpretar vínculo não localizado como exclusão do ativo.

Os caches do backend corrigido permanecem em memória por processo. Em múltiplas réplicas, verificar afinidade de sessão ou coordenação compartilhada para o acompanhamento de tarefas. As categorias sem identificação e classes com nomes duplicados mantêm as limitações de detalhamento do contrato da origem.

Para reverter o painel, restaurar a versão anterior pelo processo de publicação existente. A aba nova não altera as consultas de Usuários, Apontamentos ou Saúde.
