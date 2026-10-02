import { useEffect, useMemo, useState } from 'react';
import type { AuditItem } from '@/services/kartadoAuditService';
import { loadUnitReportings } from '@/services/kartadoUnitReportings';
import { auditCounts, auditToday, emptyAuditFilters, filterAuditItems, safeKartadoLink } from '@/utils/kartadoAudit';
import { KartadoAuditCharts } from './KartadoAuditCharts';

const field = 'w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm';
const button = 'rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50';
const number = (n: number) => n.toLocaleString('pt-BR');
// Reabrir a aba reutiliza apenas consultas concluídas, por cinco minutos.
const cache = new Map<string, { items: AuditItem[]; total: number; at: number }>();
export function KartadoUnitReportings({ company, name }: { company: string; name: string }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [reload, setReload] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [filters, setFilters] = useState({ ...emptyAuditFilters });
  const [origin, setOrigin] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    const saved = cache.get(company);
    if (!reload && saved && Date.now() - saved.at < 300_000) {
      setItems(saved.items); setTotal(saved.total); setUpdated(saved.at); setBusy(false);
      return () => controller.abort();
    }
    setBusy(true); setError(''); setItems([]); setTotal(0); setUpdated(0); cache.delete(company);
    void (async () => {
      setProgress('Buscando a primeira página...');
      const result = await loadUnitReportings(company, controller.signal, progress => {
        if (controller.signal.aborted) return;
        setItems(progress.items); setTotal(progress.total);
        setProgress(`${progress.processed} de ${progress.pages} páginas processadas · ${progress.failedPages.length} com falha · até 3 buscas simultâneas.`);
      });
      if (controller.signal.aborted) return;
      if (result.issue) { setError(result.issue); return; }
      const at = Date.now();
      if (cache.size >= 5) cache.delete(cache.keys().next().value!);
      cache.set(company, { items: result.items, total: result.total, at }); setUpdated(at);
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha na consulta.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [company, reload]);
  const visible = useMemo(() => filterAuditItems(items, filters).filter(item => (!origin || (item.origem || 'Não informada') === origin) && (!classFilter || (item.classe || 'Não informada') === classFilter)), [items, filters, origin, classFilter]);
  const counts = auditCounts(visible, auditToday());
  const north = visible.filter(item => item.trecho === 'Norte').length;
  const south = visible.filter(item => item.trecho === 'Sul').length;
  const options = (key: 'origem' | 'natureza' | 'classe' | 'status' | 'rodovia') => [...new Set(items.map(item => item[key] || (key === 'status' ? 'Não informado' : 'Não informada')))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const percent = (n: number, base = visible.length) => `${(base ? n / base * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const partial = busy || Boolean(error) || items.length !== total;
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const safePage = Math.min(page, pages);
  return <section className="mt-6 space-y-5" aria-label="Apontamentos da unidade">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-semibold">Apontamentos · {name}</h3><p className="mt-1 text-sm text-surface-600">Histórico completo, todas as origens. Use os filtros para refinar os resultados.</p></div><button type="button" className={button} disabled={busy} onClick={() => setReload(value => value + 1)}>Atualizar apontamentos</button></div>
    <div aria-live="polite" className="rounded-xl bg-brand-50 p-4 text-sm">{number(items.length)} de {number(total)} apontamentos recebidos. {busy ? progress : partial ? 'Resultado parcial.' : 'Consulta completa.'}{updated ? ` Atualizado em ${new Date(updated).toLocaleString('pt-BR')}.` : ''}</div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} Os cards e gráficos consideram somente os registros recebidos. <button type="button" className={button} onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div> : null}
    <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4"><div className="mb-3 flex items-center justify-between"><h4 className="font-semibold">Refinar apontamentos</h4><button type="button" className={button} onClick={() => { setFilters({ ...emptyAuditFilters }); setOrigin(''); setClassFilter(''); setPage(1); }}>Limpar filtros</button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs">Pesquisar<input className={field} value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} placeholder="Número, classe, natureza ou rodovia" /></label>
        <label className="text-xs">Origem<select className={field} value={origin} onChange={e => { setOrigin(e.target.value); setPage(1); }}><option value="">Todas</option>{options('origem').map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs">Classe<select className={field} value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}><option value="">Todas</option>{options('classe').map(value => <option key={value}>{value}</option>)}</select></label>
        {([['nature', 'natureza', 'Natureza'], ['status', 'status', 'Status'], ['road', 'rodovia', 'Rodovia']] as const).map(([key, source, label]) => <label key={key} className="text-xs">{label}<select className={field} value={filters[key]} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); setPage(1); }}><option value="">Todos</option>{options(source).map(value => <option key={value}>{value}</option>)}</select></label>)}
        <label className="text-xs">Sentido de tráfego<select className={field} value={filters.section} onChange={e => { setFilters({ ...filters, section: e.target.value }); setPage(1); }}><option value="">Todos</option>{['Norte', 'Sul', 'Não identificado'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">Criado de<input type="date" className={field} value={filters.from} max={filters.to || undefined} onChange={e => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /></label><label className="text-xs">Criado até<input type="date" className={field} value={filters.to} min={filters.from || undefined} onChange={e => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></label></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{[
      ['Total', counts.total, 'dos registros filtrados', 'text-surface-900'], ['Sentido Norte', north, percent(north), 'text-blue-600'], ['Sentido Sul', south, percent(south), 'text-sky-500'], ['Concluídos', counts.completed, percent(counts.completed), 'text-emerald-600'], ['Em aberto', counts.pending, percent(counts.pending), 'text-amber-600'], ['Vencidos', counts.overdue, `${percent(counts.overdue, counts.pending)} dos abertos`, 'text-red-600'],
    ].map(([label, value, detail, color]) => <div key={label} className="rounded-2xl border border-brand-100 bg-white p-4"><p className="text-xs text-surface-600">{label}{partial ? ' · parcial' : ''}</p><p className={`mt-2 text-3xl font-semibold ${color}`}>{number(Number(value))}</p><p className="mt-1 text-xs text-surface-600">{detail}</p></div>)}</div>
    <p className="text-xs text-surface-600">{number(visible.length - north - south)} sem sentido Norte/Sul identificado; {number(counts.other)} em outros status. Vencidos: pendentes com vencimento anterior a hoje, no horário de Brasília. Datas filtram a criação.</p>
    <KartadoAuditCharts items={visible} partial={partial} sectionAvailable sectionLabel="sentido de tráfego" />
    <div className="rounded-2xl border border-brand-100 bg-white p-4"><h4 className="mb-3 font-semibold">Tabela detalhada · {number(visible.length)} registros</h4><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Número', 'Origem', 'Natureza / classe', 'Sentido', 'Rodovia', 'Status', 'Vencimento'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{visible.slice((safePage - 1) * 20, safePage * 20).map(item => <tr key={item.uuid} className="border-t border-brand-100"><td className="p-3">{safeKartadoLink(item.link) ? <a className="text-brand-700 underline" href={safeKartadoLink(item.link)!} target="_blank" rel="noopener noreferrer">{item.numero || 'Abrir'}</a> : item.numero || '—'}</td><td className="p-3">{item.origem || 'Não informada'}</td><td className="p-3">{item.natureza || 'Não informada'}<span className="block text-xs text-surface-600">{item.classe}</span></td><td className="p-3">{item.trecho}</td><td className="p-3">{item.rodovia || '—'}</td><td className="p-3">{item.status || 'Não informado'}</td><td className="p-3">{item.dataVencimento?.split('-').reverse().join('/') || '—'}</td></tr>)}</tbody></table></div>{!visible.length ? <p className="p-6 text-center text-sm">{busy ? 'Aguardando registros...' : partial ? 'Nenhum registro recebido para os filtros. A consulta está incompleta.' : 'Nenhum apontamento corresponde aos filtros.'}</p> : null}<div className="mt-4 flex items-center justify-end gap-3"><button className={button} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Anterior</button><span className="text-xs">{safePage} / {pages}</span><button className={button} disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>Próxima</button></div></div>
  </section>;
}
