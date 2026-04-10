import { getKpiTooltipText, type KpiTooltipKey } from '@/utils/kpiTooltips';

interface KpiInfoIconProps {
  tooltipKey: KpiTooltipKey;
}

export function KpiInfoIcon({ tooltipKey }: KpiInfoIconProps) {
  const tooltipText = getKpiTooltipText(tooltipKey);

  return (
    <span title={tooltipText} aria-label={tooltipText} className="kpi-card-info">
      i
    </span>
  );
}
