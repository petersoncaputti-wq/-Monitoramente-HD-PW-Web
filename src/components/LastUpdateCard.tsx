import type { LatestUpdateResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface LastUpdateCardProps {
  latestUpdate: LatestUpdateResult;
}

export function LastUpdateCard({ latestUpdate }: LastUpdateCardProps) {
  const statusStyles =
    latestUpdate.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const valueStyles =
    latestUpdate.status === 'ready' ? 'text-brand-700' : 'text-surface-700';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="kpi-card-title">Última atualização</p>
        <KpiInfoIcon tooltipKey="latestUpdate" />
      </div>
      <p className={`kpi-card-value ${valueStyles}`}>
        {latestUpdate.value}
      </p>
      <p className="kpi-card-helper">{latestUpdate.helperText}</p>
    </article>
  );
}

