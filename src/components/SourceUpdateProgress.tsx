import { useEffect, useState } from 'react';

interface SourceUpdateProgressProps {
  active: boolean;
  steps: string[];
}

export function SourceUpdateProgress({ active, steps }: SourceUpdateProgressProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)));
    }, 1800);

    return () => window.clearInterval(interval);
  }, [active, steps.length]);

  if (!active) {
    return null;
  }

  const currentStep = steps[stepIndex] ?? 'Atualizando fonte...';

  return (
    <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Processando
        </p>
        <p className="text-xs font-medium text-surface-600">
          Etapa {Math.min(stepIndex + 1, steps.length)} de {steps.length}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-surface-800">{currentStep}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full w-1/2 animate-[source-progress_1.35s_ease-in-out_infinite] rounded-full bg-brand-700" />
      </div>
    </div>
  );
}
