BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_imports (
  id bigserial PRIMARY KEY,
  report_period text NOT NULL CHECK (report_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source_updated_at text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

-- Detailed files are preserved individually. Only aggregate ZIP reports
-- represent a replaceable monthly snapshot. No historical rows are removed.
DROP INDEX IF EXISTS public.totvs_imports_report_period_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS totvs_imports_zip_period_uidx
  ON public.totvs_imports (report_period)
  WHERE (payload->>'kind' IS DISTINCT FROM 'detailed');

COMMENT ON TABLE public.totvs_imports IS
  'Importações TOTVS: arquivos detalhados preservados e acumulados ZIP por mês.';
COMMENT ON COLUMN public.totvs_imports.report_period IS
  'Mês selecionado na exportação, no formato YYYY-MM.';
COMMENT ON COLUMN public.totvs_imports.source_updated_at IS
  'Data/hora da última carga na origem, no formato ISO local, sem fuso inferido.';
COMMENT ON COLUMN public.totvs_imports.payload IS
  'Indicadores identificados como TOTVS; sem armazenamento do arquivo ZIP.';

COMMIT;
