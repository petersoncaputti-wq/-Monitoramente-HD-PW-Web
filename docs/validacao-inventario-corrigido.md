# Validação das correções do inventário

Data: 22/10/2026.

Os três fontes em `C:/Users/Peterson/Downloads` foram corrigidos diretamente:

- `kartado.service.js`
- `inventario-consolidation.service.js`
- `monitoramento.router.js`

Originais preservados em `C:/Users/Peterson/Downloads/backup-monitoramento-20261022-111535`.

## Comportamento corrigido

Uma tentativa parcial não substitui o último resultado completo. Integridade, atualidade e atualização são expostas por fonte em `coleta`; falhas e tentativas incompletas permanecem visíveis, separadas dos dados exibidos. A primeira coleta parcial pode ser exibida, com validade de 15 minutos. Dados completos mantêm os TTLs de 6 horas/30 minutos. Tentativas de coleta respeitam intervalo mínimo de cinco minutos e tarefas em andamento são reutilizadas. As esperas com timeout são canceladas após conclusão para não deixar timers pendentes.

As contagens de presença consideram todos os status. O filtro de status alimenta os campos `*NoStatus` e a seleção/ordenação dos ativos com apontamento naquele status. Percentuais com denominador zero são nulos. Com qualquer fonte parcial, percentuais de cobertura e ausência são nulos; consulta de ativos sem apontamento retorna 409 com `detalhes.coleta`. A combinação `filtro=sem` com `status` retorna 400.

Coletores e detalhes exigem formato conhecido e total de paginação inteiro não negativo. Uma página com formato inválido aborta a coleta em vez de se transformar em resultado vazio/parcial. Deduplicação também ocorre em página única; contagem recebida inferior à esperada marca a consolidação como incompleta. Catálogos mantêm compatibilidade como `Map`, com diagnóstico adicional de integridade; IDs sem nome são apresentados como não resolvidos. Classe não encontrada em catálogo parcial retorna 503 em vez de 404.

As varreduras compartilham um semáforo de três requisições por processo, subordinado ao limite geral de cinco. Chamadas diretas podem utilizar os outros dois slots. Divisão adaptativa de páginas acima de 6MB foi preservada.

## Verificação

Comando reproduzível, sem rede e sem modificar os fontes durante os testes:

```powershell
node scripts/validate-inventory-corrected.mjs C:/Users/Peterson/Downloads
```

Resultado: 17 grupos passaram, cobrindo preservação/recuperação de cache, primeira coleta parcial, falhas/cooldown, polling/refresh, limite de tarefas, semântica de status, ausência com coleta parcial, catálogos, denominador zero, formato inválido inclusive em páginas posteriores, deduplicação, concorrência compartilhada, slots livres para consultas diretas, divisão de páginas grandes e contrato HTTP 202/400/409. Os três arquivos também passaram em `node --check`.

O script anterior `validate-inventory-supplied.mjs` reproduz os defeitos da versão de 20/10; suas asserções não são critérios de aprovação da versão corrigida.

## Limites da validação

Nenhum deploy ou consulta autenticada ao backend remoto foi realizado. As rotas foram exercitadas com transporte e registro de handlers simulados, sem iniciar o servidor completo. O projeto local é consumidor da integração; os arquivos corrigidos em Downloads precisam ser levados ao projeto do backend para publicação. A montagem da autenticação externa não está nestes três arquivos e não foi alterada.

Caches, tarefas e semáforos continuam em memória por processo. Coordenação entre réplicas e persistência após reinício exigem infraestrutura compartilhada. Detalhes mantêm a paginação e os filtros existentes; a resolução de nomes duplicados de Classe e a navegação de categorias sintéticas continuam fora deste conjunto de correções.
