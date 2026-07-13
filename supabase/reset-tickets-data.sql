-- Apaga somente os dados da aba Chamados.
-- Não altera usuários, perfis, roles ou dados das outras abas.

truncate table public.tickets restart identity cascade;
