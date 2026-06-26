interface PeriodFilterProps {
  endDate: string;
  filteredRowsCount: number;
  maxDate?: string;
  minDate?: string;
  onClear: () => void;
  onEndDateChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  startDate: string;
  totalRowsCount: number;
}

export function PeriodFilter({
  endDate,
  filteredRowsCount,
  maxDate,
  minDate,
  onClear,
  onEndDateChange,
  onStartDateChange,
  startDate,
  totalRowsCount,
}: PeriodFilterProps) {
  const hasImportedRows = totalRowsCount > 0;

  return (
    <div className="rounded-[28px] border border-brand-100 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-kicker">Período</p>
          <h2 className="mt-3 text-lg font-semibold text-surface-900">
            Filtrar dados por data
          </h2>
          <p className="mt-2 text-sm text-surface-700">
            {filteredRowsCount} de {totalRowsCount} registros exibidos
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data inicial
            <input
              type="date"
              value={startDate}
              min={minDate}
              max={endDate || maxDate}
              disabled={!hasImportedRows}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data final
            <input
              type="date"
              value={endDate}
              min={startDate || minDate}
              max={maxDate}
              disabled={!hasImportedRows}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <button
            type="button"
            onClick={onClear}
            disabled={!hasImportedRows}
            className="h-11 rounded-2xl border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}

