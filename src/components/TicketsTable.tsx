import type { TicketRow } from '@/types/monitoring';
import { formatTicketDate } from '@/utils/ticketsKpis';

interface TicketsTableProps {
  rows: TicketRow[];
}

function getStatusBadge(status: unknown) {
  const label = String(status ?? '').trim() || '-';
  const style =
    label === 'Fechado' || label === 'Resolvido'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : label === 'Na fila'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
        : label === 'Novo'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-surface-200 bg-surface-100 text-surface-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function getSlaBadge(status: unknown) {
  const label = String(status ?? '').trim() || '-';
  const style = label.toLowerCase().includes('violado')
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : label === 'No SLA'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-surface-200 bg-surface-100 text-surface-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

export function TicketsTable({ rows }: TicketsTableProps) {
  const sortedRows = [...rows].sort((a, b) => {
    const aViolated = String(a.StatusdoSLA ?? '').toLowerCase().includes('violado') ? 0 : 1;
    const bViolated = String(b.StatusdoSLA ?? '').toLowerCase().includes('violado') ? 0 : 1;

    if (aViolated !== bViolated) {
      return aViolated - bViolated;
    }

    return String(b.Atualizado ?? '').localeCompare(String(a.Atualizado ?? ''));
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 px-4 py-12 text-center text-sm text-surface-700">
        Nenhum chamado carregado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border bg-white shadow-soft">
      <div className="border-b border-brand-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Lista de chamados
        </p>
        <p className="mt-2 text-sm text-surface-700">
          Casos com SLA violado aparecem primeiro para facilitar a análise.
        </p>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1180px] divide-y divide-brand-100 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-brand-50">
            <tr>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 first:pl-6">
                Caso
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Status
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                SLA
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Aberto em
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Organização
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Solicitante
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Categoria
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 last:pr-6">
                Resumo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {sortedRows.map((row, index) => (
              <tr
                key={`${row['Caso n.º'] ?? row['Cason.º']}-${row.Resumo}-${index}`}
                className="transition hover:bg-brand-50/60"
              >
                <td className="whitespace-nowrap px-4 py-4 font-medium text-surface-900 first:pl-6">
                  {row['Caso n.º'] || row['Cason.º'] || '-'}
                </td>
                <td className="px-4 py-4">{getStatusBadge(row.Status)}</td>
                <td className="px-4 py-4">{getSlaBadge(row.StatusdoSLA)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-surface-900">
                  {formatTicketDate(row.Abertoem)}
                </td>
                <td className="px-4 py-4 text-surface-700">
                  {row.Organizaçãodobeneficiário || '-'}
                </td>
                <td className="max-w-[220px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row.Solicitante || '-'}</span>
                </td>
                <td className="max-w-[300px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row.Tipodeticket || '-'}</span>
                </td>
                <td className="max-w-[320px] px-4 py-4 text-surface-700 last:pr-6">
                  <span className="line-clamp-2">{row.Resumo || '-'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

