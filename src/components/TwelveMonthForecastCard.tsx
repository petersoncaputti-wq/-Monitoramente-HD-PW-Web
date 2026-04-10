import type { TwelveMonthForecastResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface TwelveMonthForecastCardProps {
  forecast: TwelveMonthForecastResult;
}

const TONE_STYLES: Record<TwelveMonthForecastResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function TwelveMonthForecastCard({
  forecast,
}: TwelveMonthForecastCardProps) {
  const statusStyles =
    forecast.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Previsão em 12 meses
          </p>
          <KpiInfoIcon tooltipKey="twelveMonthForecast" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[forecast.tone]}`}
        >
          Projeção
        </span>
      </div>
      <p className="kpi-card-value text-brand-700">
        {forecast.value}
      </p>
      <p className="kpi-card-helper">{forecast.helperText}</p>
    </article>
  );
}
