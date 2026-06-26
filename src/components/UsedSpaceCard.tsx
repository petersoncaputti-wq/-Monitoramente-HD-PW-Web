import type { UsedSpaceResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface UsedSpaceCardProps {
  usedSpace: UsedSpaceResult;
}

export function UsedSpaceCard({ usedSpace }: UsedSpaceCardProps) {
  const statusStyles =
    usedSpace.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const valueStyles =
    usedSpace.status === 'ready' ? 'text-brand-700' : 'text-surface-700';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="kpi-card-title">Espaço usado</p>
        <KpiInfoIcon tooltipKey="usedSpace" />
      </div>
      <p className={`kpi-card-value ${valueStyles}`}>
        {usedSpace.value}
      </p>
      <p className="kpi-card-helper">{usedSpace.helperText}</p>
    </article>
  );
}

