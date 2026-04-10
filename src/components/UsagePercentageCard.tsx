import type { UsagePercentageResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface UsagePercentageCardProps {
  usagePercentage: UsagePercentageResult;
}

const TONE_STYLES: Record<UsagePercentageResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  attention: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  warning: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function UsagePercentageCard({ usagePercentage }: UsagePercentageCardProps) {
  const statusStyles =
    usagePercentage.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const valueStyles =
    usagePercentage.status === 'ready' ? 'text-brand-700' : 'text-surface-700';

  const badgeLabel =
    usagePercentage.tone === 'critical'
      ? 'Crítico'
      : usagePercentage.tone === 'warning'
        ? 'Alerta'
        : usagePercentage.tone === 'attention'
          ? 'Atenção'
          : usagePercentage.tone === 'good'
            ? 'Confortável'
            : 'Sem leitura';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">Utilização atual</p>
          <KpiInfoIcon tooltipKey="usagePercentage" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[usagePercentage.tone]}`}
        >
          {badgeLabel}
        </span>
      </div>
      <p className={`kpi-card-value ${valueStyles}`}>
        {usagePercentage.value}
      </p>
      <p className="kpi-card-helper">{usagePercentage.helperText}</p>
    </article>
  );
}
