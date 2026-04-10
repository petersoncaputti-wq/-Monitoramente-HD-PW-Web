import type { PeriodVariationResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface PeriodVariationCardProps {
  periodVariation: PeriodVariationResult;
}

const TONE_STYLES: Record<PeriodVariationResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-amber-50 text-amber-700 border-amber-200',
};

const VALUE_STYLES: Record<PeriodVariationResult['tone'], string> = {
  neutral: 'text-surface-700',
  positive: 'text-emerald-700',
  negative: 'text-amber-700',
};

export function PeriodVariationCard({ periodVariation }: PeriodVariationCardProps) {
  const statusStyles =
    periodVariation.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const badgeLabel =
    periodVariation.tone === 'positive'
      ? 'Alta'
      : periodVariation.tone === 'negative'
        ? 'Redução'
        : 'Estável';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Variação no período
          </p>
          <KpiInfoIcon tooltipKey="periodVariation" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[periodVariation.tone]}`}
        >
          {badgeLabel}
        </span>
      </div>
      <p
        className={`kpi-card-value ${
          periodVariation.status === 'ready'
            ? VALUE_STYLES[periodVariation.tone]
            : 'text-surface-700'
        }`}
      >
        {periodVariation.value}
      </p>
      <p className="kpi-card-helper">{periodVariation.helperText}</p>
    </article>
  );
}
