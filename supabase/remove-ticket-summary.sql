-- Execute uma vez no SQL Editor do Supabase.
-- Os demais dados dos chamados não são alterados.
alter table public.tickets
drop column if exists summary;
