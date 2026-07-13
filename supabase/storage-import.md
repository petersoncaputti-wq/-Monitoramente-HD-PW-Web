# Importacao web da aba Armazenamento

Na versao web, a fonte recomendada para armazenamento e o CSV diario original,
no formato `historico_YYYY-MM-DD.csv`, gravado no Supabase.

Configure no `.env.local`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_publishable_key
SUPABASE_SERVICE_ROLE_KEY=sua_secret_key
STORAGE_IMPORT_SOURCE_DIR=C:\Caminho\Da\Pasta\Dos\CSVs
```

Para validar o CSV mais recente da pasta sem gravar no banco:

```bash
npm run import:storage -- --dry-run
```

Para importar o CSV mais recente para o Supabase:

```bash
npm run import:storage
```

Tambem e possivel informar um arquivo especifico:

```bash
npm run import:storage -- C:\Caminho\historico_2026-07-12.csv
```

O importador usa `observed_at + computer + unit` como chave de conflito no
Supabase. Se o mesmo CSV for importado novamente, os registros existentes sao
atualizados em vez de duplicados.
