# Remo??o da prioridade do ProjectWise

O formul?rio, as APIs e os importadores de tickets n?o gravam mais prioridade.
A coluna compartilhada `Prioridade` do tipo de importa??o permanece para o TOTVS.
Kartado e TOTVS n?o s?o alterados.

## Banco existente

1. Publicar a nova vers?o do servidor e do frontend.
2. Fazer backup do banco conforme o procedimento do ambiente.
3. Executar `npm run db:remove-pw-priority` com as credenciais de migra??o do ambiente em `.env.local`, ou aplicar `azure/remove-projectwise-ticket-priority.sql` no banco de destino.

A migra??o ? idempotente e exclui definitivamente apenas a coluna `tickets.priority` e seus valores. Os demais campos e chamados s?o preservados. N?o executar antes da publica??o: o servidor antigo ainda referencia a coluna. Em instala??es Supabase legadas, aplicar o mesmo SQL na tabela `public.tickets` ap?s atualizar a API.
