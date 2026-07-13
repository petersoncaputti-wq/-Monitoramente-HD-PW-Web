interface ProjectWiseUserKpiCardProps {
  title: string;
  value: string;
  helperText: string;
  tone?: 'default' | 'good' | 'attention' | 'warning';
}

const TONE_STYLES: Record<NonNullable<ProjectWiseUserKpiCardProps['tone']>, string> = {
  default: 'border-brand-100 bg-white text-brand-700',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  attention: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  warning: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function ProjectWiseUserKpiCard({
  title,
  value,
  helperText,
  tone = 'default',
}: ProjectWiseUserKpiCardProps) {
  return (
    <article className={`kpi-card kpi-card-compact ${TONE_STYLES[tone]}`}>
      <p className="kpi-card-title">{title}</p>
      <p className="kpi-card-value">{value}</p>
      <p className="kpi-card-helper">{helperText}</p>
    </article>
  );
}
