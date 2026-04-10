import type { DaysUntilFullResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface DaysUntilFullCardProps {
  daysUntilFull: DaysUntilFullResult;
}

const TONE_STYLES: Record<DaysUntilFullResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  attention: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  warning: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function DaysUntilFullCard({ daysUntilFull }: DaysUntilFullCardProps) {
  const statusStyles =
    daysUntilFull.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const badgeLabel =
    daysUntilFull.tone === 'critical'
      ? 'Crítico'
      : daysUntilFull.tone === 'warning'
        ? 'Alerta'
        : daysUntilFull.tone === 'attention'
          ? 'Atenção'
          : 'Estável';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Dias até esgotar
          </p>
          <KpiInfoIcon tooltipKey="daysUntilFull" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[daysUntilFull.tone]}`}
        >
          {badgeLabel}
        </span>
      </div>
      <p className="kpi-card-value text-brand-700">
        {daysUntilFull.value}
      </p>
      <p className="kpi-card-helper">{daysUntilFull.helperText}</p>
    </article>
  );
}
