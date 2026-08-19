import type { DatePeriodPreset } from '@/utils/datePeriod';

interface PeriodFilterProps {
  endDate: string;
  filteredRowsCount: number;
  isLatestAvailableMonth?: boolean;
  maxDate?: string;
  minDate?: string;
  onEndDateChange: (value: string) => void;
  onPresetChange: (preset: DatePeriodPreset) => void;
  onStartDateChange: (value: string) => void;
  startDate: string;
  totalRowsCount: number;
}

export function PeriodFilter({
  endDate,
  filteredRowsCount,
  isLatestAvailableMonth = false,
  maxDate,
  minDate,
  onEndDateChange,
  onPresetChange,
  onStartDateChange,
  startDate,
  totalRowsCount,
}: PeriodFilterProps) {
  const hasImportedRows = totalRowsCount > 0;

  return (
    <div className="rounded-[28px] border border-brand-100 bg-white p-5 shadow-soft">
      <div>
        <p className="section-kicker">Período</p>
        <h2 className="mt-3 text-lg font-semibold text-surface-900">
          Filtrar dados por data
        </h2>
        <p className="mt-2 text-sm text-surface-700">
          {filteredRowsCount} de {totalRowsCount} registros exibidos
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)] sm:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data inicial
            <input
              type="date"
              value={startDate}
              min={minDate || undefined}
              max={endDate || maxDate || undefined}
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
              min={startDate || minDate || undefined}
              max={maxDate || undefined}
              disabled={!hasImportedRows}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['currentMonth', 'Mês atual'],
            ['last3Months', 'Últimos 3 meses'],
            ['last12Months', 'Últimos 12 meses'],
            ['all', 'Todo o período'],
          ].map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => onPresetChange(preset as DatePeriodPreset)}
              disabled={!hasImportedRows}
              className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>

        {isLatestAvailableMonth ? (
          <p className="mt-3 text-xs font-medium text-amber-700">
            Sem registros no mês atual; exibindo o mês mais recente disponível.
          </p>
        ) : null}
      </div>
    </div>
  );
}

