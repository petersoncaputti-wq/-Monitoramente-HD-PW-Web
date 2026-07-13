-- Remove a configuracao manual de capacidade.
-- Use somente se a tabela tiver sido criada anteriormente.
-- A capacidade oficial passa a vir do campo TotalGB de cada linha importada do CSV.

drop table if exists public.storage_settings;
