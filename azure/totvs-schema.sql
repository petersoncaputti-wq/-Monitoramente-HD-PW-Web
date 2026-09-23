BEGIN;

CREATE TABLE IF NOT EXISTS public.totvs_imports (
  id bigserial PRIMARY KEY,
  report_period text NOT NULL CHECK (report_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source_updated_at text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

-- One accumulated record per month. Reimports update this row.
-- If a previous installation contains duplicate months, fail atomically;
-- this creation script never deletes historical records automatically.
CREATE UNIQUE INDEX IF NOT EXISTS totvs_imports_report_period_uidx
  ON public.totvs_imports (report_period);

COMMENT ON TABLE public.totvs_imports IS
  'Acumulado mensal TOTVS. Uma linha por mês; atualizações semanais substituem os dados do mês.';
COMMENT ON COLUMN public.totvs_imports.report_period IS
  'Mês selecionado na exportação, no formato YYYY-MM.';
COMMENT ON COLUMN public.totvs_imports.source_updated_at IS
  'Data/hora da última carga na origem, no formato ISO local, sem fuso inferido.';
COMMENT ON COLUMN public.totvs_imports.payload IS
  'Indicadores identificados como TOTVS; sem armazenamento do arquivo ZIP.';

COMMIT;
