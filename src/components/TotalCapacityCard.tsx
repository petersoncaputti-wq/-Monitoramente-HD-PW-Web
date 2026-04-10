import type { TotalCapacityResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface TotalCapacityCardProps {
  totalCapacity: TotalCapacityResult;
}

export function TotalCapacityCard({ totalCapacity }: TotalCapacityCardProps) {
  const statusStyles =
    totalCapacity.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  const valueStyles =
    totalCapacity.status === 'ready' ? 'text-brand-700' : 'text-surface-700';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="kpi-card-title">Capacidade total</p>
        <KpiInfoIcon tooltipKey="totalCapacity" />
      </div>
      <p className={`kpi-card-value ${valueStyles}`}>
        {totalCapacity.value}
      </p>
      <p className="kpi-card-helper">{totalCapacity.helperText}</p>
    </article>
  );
}
