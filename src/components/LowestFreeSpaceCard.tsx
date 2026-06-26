import type { LowestFreeSpaceResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface LowestFreeSpaceCardProps {
  lowestFreeSpace: LowestFreeSpaceResult;
}

const TONE_STYLES: Record<LowestFreeSpaceResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function LowestFreeSpaceCard({
  lowestFreeSpace,
}: LowestFreeSpaceCardProps) {
  const statusStyles =
    lowestFreeSpace.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Menor espaço livre
          </p>
          <KpiInfoIcon tooltipKey="lowestFreeSpace" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[lowestFreeSpace.tone]}`}
        >
          Mínimo
        </span>
      </div>
      <p className="kpi-card-value text-amber-700">
        {lowestFreeSpace.value}
      </p>
      <p className="kpi-card-helper">{lowestFreeSpace.helperText}</p>
    </article>
  );
}

