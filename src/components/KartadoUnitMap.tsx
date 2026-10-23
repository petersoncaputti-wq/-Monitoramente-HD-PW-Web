import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { initialMapDates, loadMapReportings, type MapCache, type MapResult } from '@/services/kartadoMapService';
import { KartadoReportingDialog } from './KartadoReportingDialog';
const MapCanvas = lazy(() => import('./KartadoUnitMapCanvas'));
const field = 'min-w-0 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-xs';
const button = 'rounded-xl border border-brand-200 px-4 py-2.5 text-xs font-semibold text-brand-700 disabled:opacity-40';
const number = (value: number) => value.toLocaleString('pt-BR');

export function KartadoUnitMap({ company, name, cache }: { company: string; name: string; cache: MapCache }) {
  const [initial] = useState(initialMapDates);
  const [dates, setDates] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<MapResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [classe, setClasse] = useState('');
  const [road, setRoad] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const key = `${company}:${applied.from}:${applied.to}`;
    const saved = cache.get(key);
    if (!revision && saved && Date.now() - saved.at < 300000) { setResult(saved.result); setBusy(false); return () => controller.abort(); }
    setBusy(true); setError(''); setResult(null);
    void loadMapReportings(company, applied.from, applied.to, controller.signal, value => { if (!controller.signal.aborted) setResult(value); })
      .then(value => {
        if (controller.signal.aborted) return;
        setResult(value);
        if (!value.partial) {
          cache.set(key, { at: Date.now(), result: value });
          if (cache.size > 5) cache.delete(cache.keys().next().value!);
        }
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Mapa indisponível.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [company, applied.from, applied.to, revision, cache]);
  useEffect(() => { setPage(1); }, [status, classe, road, applied]);
  const visible = useMemo(() => (result?.items || []).filter(item => (!status || item.status === status) && (!classe || item.classe === classe) && (!road || item.rodovia === road)), [result, status, classe, road]);
  const mapped = useMemo(() => visible.filter(item => item.coordinates), [visible]);
  const options = (key: 'status' | 'classe' | 'rodovia') => [...new Set((result?.items || []).map(item => item[key]).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const pages = Math.max(1, Math.ceil(visible.length / 20)), safePage = Math.min(page, pages);
  const dirty = dates.from !== applied.from || dates.to !== applied.to;
  return <section className="space-y-4 rounded-2xl border border-brand-100 bg-white p-4 sm:p-5" aria-label={`Mapa de apontamentos de ${name}`}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">Mapa dos apontamentos</h3><p className="mt-1 text-xs text-surface-600">{name} · use o mapa de calor para localizar concentrações e clique para consultar os apontamentos.</p></div><button type="button" className={button} disabled={busy} onClick={() => setRevision(value => value + 1)}>Atualizar mapa</button></header>
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => {
      event.preventDefault();
      if (dates.from > dates.to || Date.parse(dates.to) - Date.parse(dates.from) > 365 * 86400000) { setError('Selecione um período de até 366 dias, com início anterior ao fim.'); return; }
      setApplied({ ...dates }); setRevision(0); setStatus(''); setClasse(''); setRoad('');
    }}><label className="grid gap-1 text-xs text-surface-700">Encontrado de<input type="date" required max={dates.to} value={dates.from} onChange={event => setDates(value => ({ ...value, from: event.target.value }))} className={field} /></label><label className="grid gap-1 text-xs text-surface-700">Encontrado até<input type="date" required min={dates.from} value={dates.to} onChange={event => setDates(value => ({ ...value, to: event.target.value }))} className={field} /></label><button className={button} type="submit" disabled={!dirty}>Aplicar período</button></form>
    <p className="text-[11px] text-surface-600">Período do mapa: {applied.from.split('-').reverse().join('/')} a {applied.to.split('-').reverse().join('/')} · data em que o apontamento foi encontrado. Inicialmente, últimos 30 dias.</p>
    <div className="grid gap-3 sm:grid-cols-3">{([['Status', 'status', status, setStatus], ['Classe', 'classe', classe, setClasse], ['Rodovia', 'rodovia', road, setRoad]] as const).map(([label, key, value, change]) => <label key={key} className="grid gap-1 text-xs text-surface-700">{label}<select className={field} value={value} onChange={event => change(event.target.value)}><option value="">Todos</option>{options(key).map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="rounded-xl bg-brand-50 p-3 text-xs leading-6" aria-live="polite">{number(result?.items.length || 0)} de {number(result?.total || 0)} registros recebidos no período. {busy ? `Carregando páginas: ${result?.processed || 0} de ${result?.pages || '…'}.` : result?.partial || error ? 'Consulta parcial.' : 'Consulta completa.'}<br />Com os filtros selecionados: {number(mapped.length)} pontos no mapa · {number(visible.length - mapped.length)} registros sem coordenadas válidas.</div>
    {result?.warnings.map(warning => <p key={warning} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>)}

    {mapped.length ? <Suspense fallback={<p role="status" className="rounded-xl bg-brand-50 p-8 text-sm">Preparando mapa…</p>}><MapCanvas items={mapped} onOpen={setSelected} /></Suspense> : <p className="rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-surface-600">{busy ? 'Aguardando pontos com coordenadas…' : 'Nenhum ponto disponível para os filtros e registros recebidos.'}</p>}
    <details className="rounded-xl border border-brand-100 p-3"><summary className="cursor-pointer text-sm font-semibold text-brand-700">Ver registros em lista ({number(visible.length)})</summary><div className="mt-3 space-y-2">{visible.slice((safePage - 1) * 20, safePage * 20).map(item => <button key={item.uuid} type="button" onClick={() => setSelected(item.uuid)} className="block w-full rounded-xl border border-brand-100 p-3 text-left text-xs hover:bg-brand-50"><strong>{item.numero || item.uuid}</strong> · {item.status}<span className="mt-1 block text-surface-600">{item.classe} · {item.rodovia || 'Rodovia não informada'} · km {item.km ?? '—'}{!item.coordinates ? ' · Sem coordenadas' : ''}</span></button>)}</div><div className="mt-3 flex items-center justify-end gap-3"><button className={button} type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Anterior</button><span className="text-xs">{safePage} / {pages}</span><button className={button} type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>Próxima</button></div></details>
    {selected && <KartadoReportingDialog company={company} uuid={selected} onClose={() => setSelected(null)} />}
  </section>;
}
