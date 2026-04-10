import type { PeakUsageResult } from '@/types/monitoring';
import { KpiInfoIcon } from '@/components/KpiInfoIcon';

interface PeakUsageCardProps {
  peakUsage: PeakUsageResult;
}

const TONE_STYLES: Record<PeakUsageResult['tone'], string> = {
  neutral: 'bg-surface-100 text-surface-700 border-surface-200',
  highlight: 'bg-brand-50 text-brand-700 border-brand-200',
};

export function PeakUsageCard({ peakUsage }: PeakUsageCardProps) {
  const statusStyles =
    peakUsage.status === 'invalid'
      ? 'border-amber-200 bg-amber-50'
      : 'border-brand-100 bg-white';

  return (
    <article className={`kpi-card ${statusStyles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="kpi-card-title">
            Pico de uso
          </p>
          <KpiInfoIcon tooltipKey="peakUsage" />
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_STYLES[peakUsage.tone]}`}
        >
          Pico
        </span>
      </div>
      <p className="kpi-card-value text-brand-700">
        {peakUsage.value}
      </p>
      <p className="kpi-card-helper">{peakUsage.helperText}</p>
    </article>
  );
}
