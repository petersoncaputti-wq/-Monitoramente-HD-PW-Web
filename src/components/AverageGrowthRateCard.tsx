import type { AverageGrowthRateResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface AverageGrowthRateCardProps {
  averageGrowthRate: AverageGrowthRateResult;
}

const TONE_STYLES: Record<AverageGrowthRateResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-amber-50 text-amber-700 border-amber-200',
};

const VALUE_STYLES: Record<AverageGrowthRateResult['tone'], string> = {
  neutral: 'text-surface-700',
  positive: 'text-emerald-700',
  negative: 'text-amber-700',
};

export function AverageGrowthRateCard({
  averageGrowthRate,
}: AverageGrowthRateCardProps) {
  const statusStyles =
    averageGrowthRate.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const badgeLabel =
    averageGrowthRate.tone === 'positive'
      ? 'Alta'
      : averageGrowthRate.tone === 'negative'
        ? 'Redução'
        : 'Estável';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Taxa média de crescimento
          </p>
          <KpiInfoIcon tooltipKey="averageGrowthRate" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[averageGrowthRate.tone]}`}
        >
          {badgeLabel}
        </span>
      </div>
      <p
        className={`kpi-card-value ${
          averageGrowthRate.status === 'ready'
            ? VALUE_STYLES[averageGrowthRate.tone]
            : 'text-surface-700'
        }`}
      >
        {averageGrowthRate.value}
      </p>
      <p className="kpi-card-helper">{averageGrowthRate.helperText}</p>
    </article>
  );
}

