-- Apaga somente os dados da aba Chamados.
-- Nao altera usuarios, perfis, roles ou dados das outras abas.

truncate table public.tickets restart identity cascade;
