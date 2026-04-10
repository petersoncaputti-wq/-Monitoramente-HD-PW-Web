import type { ImportedWorkbookData } from '@/types/monitoring';
import {
  formatPreviewValue,
  getDisplayHeaderLabel,
  isValidHeader,
} from '@/utils/excel';

interface DataPreviewTableProps {
  data: ImportedWorkbookData;
}

export function DataPreviewTable({ data }: DataPreviewTableProps) {
  const visibleHeaders = data.headers.filter(isValidHeader);
  const previewRows = data.rows.slice(0, 8);

  if (visibleHeaders.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 px-4 py-12 text-center text-sm text-surface-700">
        A planilha foi carregada, mas não foram encontradas colunas para exibir.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border bg-white shadow-soft">
      <div className="border-b border-brand-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Prévia dos dados importados
        </p>
        <p className="mt-2 text-sm text-surface-700">
          Exibindo as colunas válidas encontradas na planilha e os primeiros registros lidos.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-brand-100 text-left text-sm">
          <thead className="bg-brand-50">
            <tr>
              {visibleHeaders.map((header) => (
                <th
                  key={header}
                  className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 first:pl-6 last:pr-6"
                >
                  {getDisplayHeaderLabel(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {previewRows.map((row, index) => (
              <tr
                key={`${row.Data ?? 'linha'}-${row.Hora ?? index}-${index}`}
                className="transition hover:bg-brand-50/60"
              >
                {visibleHeaders.map((header) => (
                  <td
                    key={`${header}-${index}`}
                    className="px-4 py-4 text-surface-900 first:pl-6 last:pr-6"
                  >
                    {formatPreviewValue(header, row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.rows.length > previewRows.length ? (
        <div className="border-t border-brand-100 bg-brand-50/50 px-5 py-3 text-xs text-surface-700">
          Exibindo {previewRows.length} de {data.rows.length} registros importados.
        </div>
      ) : null}
    </div>
  );
}
