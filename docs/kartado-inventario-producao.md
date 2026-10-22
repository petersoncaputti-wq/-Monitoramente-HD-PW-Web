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

O primeiro acesso pode retornar 202. A tela respeita `Retry-After` e acompanha a mesma consulta até concluir. Sair da aba cancela as requisições e esperas do navegador; a coleta já iniciada continua no serviço de origem. Com resultado anterior e atualização em andamento, os dados e metadados permanecem visíveis enquanto a tela acompanha o estado. O acompanhamento tem limite de 15 minutos; após isso o usuário pode consultar novamente. Uma atualização manual respeita intervalo de cinco minutos.

## Ordem de publicação

1. No repositório do Agente Auditor, aplicar os arquivos corrigidos de `Downloads` nos caminhos correspondentes a `backend/routes/monitoramento.router.js`, `backend/services/inventario-consolidation.service.js` e `backend/services/kartado.service.js`. Ajustar os caminhos se a estrutura do repositório diferir. Preservar a montagem existente da autenticação.
2. Executar a validação do backend corrigido e publicar pelo fluxo desse serviço. Confirmar que os endpoints autenticados retornam o contrato de 22/10/2026.
3. Confirmar a configuração das duas variáveis no App Service do painel.
4. Executar `npm run test:kartado-inventory`, os testes de regressão e `npm run build`.
5. Publicar o painel pelo workflow de `azure-migration`. A publicação é disparada por push nessa branch.
6. Conferir a execução do GitHub Actions, a saúde da aplicação e a nova aba em uma sessão autenticada.

Nenhum push/deploy deve ser considerado concluído apenas porque o build local passou. O Agente Auditor e o painel são serviços diferentes.

## Validação

`npm run test:kartado-inventory` exercita parâmetros, contrato atualizado, rejeição do contrato antigo, isolamento de credenciais, coleta parcial, métricas por status, detalhes paginados, sessão obrigatória, respostas HTTP e polling/cancelamento do cliente real do frontend. O workflow de publicação inclui essa suíte.

Homologação autenticada: resumo de uma unidade menor e uma maior; primeira coleta; filtros de classe/rodovia; status sem alterar presença; `Sem apontamento` apenas com ambas as fontes completas; detalhes com aviso de histórico completo; atualização/falha preservando dados; estados parcial e vazio. Não interpretar vínculo não localizado como exclusão do ativo.

Os caches do backend corrigido permanecem em memória por processo. Em múltiplas réplicas, verificar afinidade de sessão ou coordenação compartilhada para o acompanhamento de tarefas. As categorias sem identificação e classes com nomes duplicados mantêm as limitações de detalhamento do contrato da origem.

Para reverter o painel, restaurar a versão anterior pelo processo de publicação existente. A aba nova não altera as consultas de Usuários, Apontamentos ou Saúde.
