import type { PropsWithChildren, ReactNode } from 'react';

interface PanelShellProps extends PropsWithChildren {
  title: string;
  description: string;
  actions?: ReactNode;
  tone?: 'default' | 'soft';
}

export function PanelShell({
  title,
  description,
  actions,
  tone = 'default',
  children,
}: PanelShellProps) {
  const isSoft = tone === 'soft';

  return (
    <section
      className={`rounded-[28px] border bg-[var(--color-surface)] shadow-panel ${
        isSoft ? 'bg-[var(--color-surface-soft)]' : ''
      }`}
    >
      <div className="flex flex-col gap-4 border-b px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <h2 className="text-xl font-semibold text-surface-900 md:text-2xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-surface-700 md:text-base">
            {description}
          </p>
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
      <div className="px-6 py-6 md:px-8">{children}</div>
    </section>
  );
}
