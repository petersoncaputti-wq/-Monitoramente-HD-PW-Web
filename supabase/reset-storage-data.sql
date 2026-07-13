-- Apaga somente os dados da aba Armazenamento.
-- Nao altera usuarios, perfis, roles ou configuracoes de autenticacao.

truncate table public.storage_readings restart identity cascade;
truncate table public.storage_imports restart identity cascade;
