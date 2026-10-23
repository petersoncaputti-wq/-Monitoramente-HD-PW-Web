import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { KartadoReportingDetails } from './KartadoReportingDetails';

export function KartadoReportingDialog({ company, uuid, onClose }: { company: string; uuid: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby="reporting-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 text-surface-900 shadow-2xl backdrop:bg-surface-900/60 sm:h-[92dvh] sm:w-[94vw] sm:max-w-6xl sm:rounded-3xl">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-brand-100 px-5 py-4"><h2 id="reporting-dialog-title" className="font-semibold">Ficha do apontamento</h2><button autoFocus type="button" onClick={onClose} aria-label="Fechar ficha do apontamento" className="rounded-xl border border-brand-100 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">Fechar ×</button></header>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 sm:px-6"><KartadoReportingDetails key={`${company}:${uuid}`} company={company} uuid={uuid} onBack={onClose} /></div>
      </div>
    </dialog>, document.body,
  );
}
