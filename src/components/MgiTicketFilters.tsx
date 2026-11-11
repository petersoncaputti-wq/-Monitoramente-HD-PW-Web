import { useMemo } from 'react';
import type { TicketRow } from '@/types/monitoring';
import { mgiFilterFields, ticketFilterValue, type MgiTicketFilters as Filters } from '@/utils/mgiTicketFilters';

const inputClass = 'h-11 w-full rounded-xl border border-brand-100 bg-white px-3 text-sm';

export function MgiTicketFilters({ rows, filters, onChange, onClear }: {
  rows: TicketRow[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}) {
  const options = useMemo(() => Object.fromEntries(mgiFilterFields.map(field => [field.key,
    [...new Set(rows.map(row => ticketFilterValue(row[field.key])))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ])), [rows]);

  function fieldControl(field: typeof mgiFilterFields[number]) {
    const selected = filters.values[field.key] ?? [];
    return <div key={field.key} className="min-w-0">
      <p className="mb-2 text-sm font-medium text-surface-700">{field.label}</p>
      <details className="rounded-xl border border-brand-100 bg-white">
        <summary className="cursor-pointer px-3 py-3 text-sm">{selected.length ? `${selected.length} selecionado(s)` : 'Todos'}</summary>
        <div className="max-h-52 space-y-2 overflow-auto border-t border-brand-100 p-3" role="group" aria-label={field.label}>
          {options[field.key].map(value => <label key={value} className="flex items-start gap-2 text-sm text-surface-700">
            <input type="checkbox" className="mt-1" checked={selected.includes(value)} onChange={event => onChange({ ...filters, values: { ...filters.values, [field.key]: event.target.checked ? [...selected, value] : selected.filter(item => item !== value) } })} />
            <span className="break-words">{value || 'Não informado'}</span>
          </label>)}
          {!options[field.key].length && <p className="text-sm text-surface-600">Sem valores disponíveis.</p>}
        </div>
      </details>
    </div>;
  }

  return <div className="mt-5 space-y-4">
    <p className="text-sm text-surface-700">Os filtros de criação, resolução e campos abaixo atualizam todos os indicadores e a lista. Selecione um ou mais valores em cada campo.</p>
    <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">{mgiFilterFields.filter(field => !('advanced' in field)).map(fieldControl)}</div>
    <details className="rounded-2xl border border-brand-100 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-brand-700">Mais filtros</summary>
      <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Resolução de<input type="date" className={inputClass} value={filters.resolutionStart} max={filters.resolutionEnd || undefined} onChange={event => onChange({ ...filters, resolutionStart: event.target.value })} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Resolução até<input type="date" className={inputClass} value={filters.resolutionEnd} min={filters.resolutionStart || undefined} onChange={event => onChange({ ...filters, resolutionEnd: event.target.value })} /></label>
        {mgiFilterFields.filter(field => 'advanced' in field).map(fieldControl)}
      </div>
      <p className="mt-3 text-xs text-surface-600">Ao filtrar por resolução, chamados sem data de resolução ficam fora da seleção. Para analisar resoluções independentemente da criação, selecione “Todo o período”.</p>
    </details>
    <button type="button" onClick={onClear} className="rounded-xl border border-brand-100 px-3 py-2 text-sm font-semibold text-brand-700">Limpar todos os filtros</button>
  </div>;
}
