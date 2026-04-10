import type { FreeSpaceResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface FreeSpaceCardProps {
  freeSpace: FreeSpaceResult;
}

export function FreeSpaceCard({ freeSpace }: FreeSpaceCardProps) {
  const statusStyles =
    freeSpace.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const valueStyles =
    freeSpace.status === 'ready' ? 'text-brand-700' : 'text-surface-700';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="kpi-card-title">Espaço livre</p>
        <KpiInfoIcon tooltipKey="freeSpace" />
      </div>
      <p className={`kpi-card-value ${valueStyles}`}>
        {freeSpace.value}
      </p>
      <p className="kpi-card-helper">{freeSpace.helperText}</p>
    </article>
  );
}
