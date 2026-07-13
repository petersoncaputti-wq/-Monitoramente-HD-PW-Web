-- Apaga somente os dados da aba Armazenamento.
-- Não altera usuários, perfis, roles ou configurações de autenticação.

truncate table public.storage_readings restart identity cascade;
truncate table public.storage_imports restart identity cascade;
