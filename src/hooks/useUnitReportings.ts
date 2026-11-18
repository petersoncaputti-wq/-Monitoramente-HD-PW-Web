import { useEffect, useState } from 'react';
import type { AuditItem } from '@/services/kartadoAuditService';
import { loadUnitReportings, loadUnitReportingPage } from '@/services/kartadoUnitReportings';

// Compartilhado entre a Visão geral e as abas Apontamentos/Inventário: reabrir uma
// delas reutiliza apenas consultas concluídas, por cinco minutos.
const cache = new Map<string, { items: AuditItem[]; total: number; at: number }>();

export function useUnitReportings(company: string, kind: 'reportings' | 'inventory' = 'reportings') {
  const cacheKey = `${company}:${kind}`;
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [reload, setReload] = useState(0);
  const [updated, setUpdated] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const saved = cache.get(cacheKey);
    if (!reload && saved && Date.now() - saved.at < 300_000) {
      setItems(saved.items);
      setTotal(saved.total);
      setUpdated(saved.at);
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true);
    setError('');
    setItems([]);
    setTotal(0);
    setUpdated(0);
    cache.delete(cacheKey);
    void (async () => {
      setProgress('Buscando a primeira página...');
      const result = await loadUnitReportings(
        company,
        controller.signal,
        (progress) => {
          if (controller.signal.aborted) return;
          setItems(progress.items);
          setTotal(progress.total);
          setProgress(
            `${progress.processed} de ${progress.pages} páginas processadas · ${progress.failedPages.length} com falha · até 3 buscas simultâneas.`,
          );
        },
        (unit, pageNumber, signal) => loadUnitReportingPage(unit, pageNumber, signal, kind),
      );
      if (controller.signal.aborted) return;
      if (result.issue) {
        setError(result.issue);
        return;
      }
      const at = Date.now();
      if (cache.size >= 5) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { items: result.items, total: result.total, at });
      setUpdated(at);
    })()
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha na consulta.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [company, kind, cacheKey, reload]);
  return {
    items,
    total,
    busy,
    error,
    progress,
    updated,
    partial: busy || Boolean(error) || items.length !== total,
    refresh: () => setReload((value) => value + 1),
  };
}
