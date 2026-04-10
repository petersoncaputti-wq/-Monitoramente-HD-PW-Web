import type { ImportedWorkbookData } from '@/types/monitoring';

interface FileSummaryProps {
  data: ImportedWorkbookData;
}

export function FileSummary({ data }: FileSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-surface-700">
          Arquivo importado
        </p>
        <p className="mt-2 truncate text-sm font-medium text-surface-900">{data.fileName}</p>
      </div>
      <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-surface-700">
          Registros lidos
        </p>
        <p className="mt-2 text-3xl font-semibold text-brand-700">{data.rows.length}</p>
      </div>
      <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-surface-700">
          Colunas detectadas
        </p>
        <p className="mt-2 text-3xl font-semibold text-brand-700">{data.headers.length}</p>
      </div>
    </div>
  );
}
