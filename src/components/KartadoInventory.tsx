import { useEffect, useRef, useState, type ReactNode } from 'react';
import { followInventory, requestInventory, type AssetReportings, type CollectionQuality, type InventoryAsset, type InventoryCrossing, type InventoryItems, type InventoryProcessing, type InventoryResult, type InventorySummary } from '@/services/kartadoInventoryService';
import { safeKartadoLink } from '@/utils/kartadoAudit';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-brand-700 bg-brand-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-800';
const input = 'min-w-0 rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-xs text-surface-900';
const number = (n: number | null | undefined) => n == null ? 'Indisponível' : n.toLocaleString('pt-BR');
const percent = (n: number | null | undefined) => n == null ? 'Indisponível' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const timestamp = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex min-w-[150px] flex-1 flex-col gap-2 text-xs font-medium text-surface-700"><span>{label}</span>{children}</label>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <article className="min-w-0 rounded-2xl border border-brand-100 bg-white p-4"><p className="text-xs text-surface-700">{label}</p><strong className="mt-3 block break-words text-2xl font-semibold text-brand-800">{value}</strong><p className="mt-2 text-[11px] leading-5 text-surface-600">{note}</p></article>; }

function useInventory<T extends InventoryResult>(path: string, query: string, enabled: boolean, revision: number) {
  const [data, setData] = useState<T | null>(null);
  const [processing, setProcessing] = useState<InventoryProcessing | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lastKey = useRef('');
  const lastRevision = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const key = `${path}?${query}`;
    if (lastKey.current !== key) setData(null);
    lastKey.current = key;
    const force = revision > lastRevision.current;
    lastRevision.current = revision;
    setLoading(true); setProcessing(null); setError('');
    void followInventory<T>(path, `${query}${force ? '&refresh=1' : ''}`, controller.signal, value => {
      if (value.status === 'processando') setProcessing(value);
      else { setData(value); setProcessing(null); setLoading(false); }
    }).catch(reason => { if (!controller.signal.aborted) { setProcessing(null); setError(reason instanceof Error ? reason.message : 'Inventário indisponível.'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, query, enabled, revision]);
  return { data, loading, processing, error };
}
function Quality({ name, value }: { name: string; value: CollectionQuality }) {
  const partial = !value.integridade.completa;
  const update = value.atualizacao;
  return <div className={`rounded-xl border p-3 ${partial || value.atualidade.expirado || ['falhou', 'incompleta'].includes(update.estado) ? 'border-amber-200 bg-amber-50' : 'border-brand-100 bg-brand-50/70'}`}><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong>{name} · {partial ? 'Coleta parcial' : 'Coleta completa'}{value.atualidade.expirado ? ' · Dados desatualizados' : ''}</strong><span className="text-[11px]">Coletado em {timestamp(value.atualidade.geradoEm)} · Brasília</span></div><p className="mt-2 text-[11px] leading-5">{number(value.integridade.recebidos)} de {number(value.integridade.esperados)} registros recebidos.{update.estado === 'em_andamento' ? ' Atualização em andamento; o resultado anterior continua disponível.' : update.estado === 'falhou' ? ' A última atualização falhou; o resultado anterior foi preservado.' : update.estado === 'incompleta' ? ' A última atualização foi incompleta.' : ' Sem atualização em andamento.'}</p>{partial && <p className="mt-1 text-[11px]">{value.integridade.motivos.join(' ')}</p>}{update.estado === 'incompleta' && <p className="mt-1 text-[11px]">{update.motivos?.join(' ')}</p>}{update.novaTentativaAPartirDe && <p className="mt-1 text-[11px]">Nova tentativa a partir de {timestamp(update.novaTentativaAPartirDe)}.</p>}</div>;
}
interface Detail { classe?: string; rodovia?: string; asset?: InventoryAsset; crossing?: boolean; status?: string; mode?: string }

export function KartadoInventory({ company, name }: { company: string; name: string }) {
  const [view, setView] = useState<'summary' | 'cross'>('summary');
  const [classe, setClasse] = useState('');
  const [road, setRoad] = useState('');
  const [dimension, setDimension] = useState<'classe' | 'rodovia' | 'ativo'>('classe');
  const [period, setPeriod] = useState('recente');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('com');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [refreshUntil, setRefreshUntil] = useState(0);
  const [cooldown, setCooldown] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [items, setItems] = useState<InventoryItems | InventoryCrossing | null>(null);
  const [reports, setReports] = useState<AssetReportings | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const baseQuery = new URLSearchParams({ concessao: company }).toString();
  const filterQuery = new URLSearchParams({ concessao: company, ...(classe && { classe }), ...(road && { rodovia: road }) }).toString();
  const base = useInventory<InventorySummary>('resumo', baseQuery, true, revision);
  const recut = useInventory<InventorySummary>('resumo', filterQuery, Boolean(classe || road) && view === 'summary', revision);
  const summary = classe || road ? recut : base;
  const crossingQuery = new URLSearchParams({ concessao: company, dimensao: dimension, periodo: period, ...(classe && { classe }), ...(road && { rodovia: road }), ...(status && { status }), filtro: mode, page: String(page), page_size: '100' }).toString();
  const crossing = useInventory<InventoryCrossing>('cruzamento', crossingQuery, view === 'cross', revision);
  const active = view === 'summary' ? summary : crossing;
  const result = active.data;
  const isPartial = (view === 'cross' ? crossing.data?.coletaCompleta : summary.data?.coletaCompleta) === false;
  const updating = result && Object.values(result.coleta).some(source => source?.atualizacao.estado === 'em_andamento');
  const summaryRows = dimension === 'rodovia' ? summary.data?.porRodovia.map(r => ({ key: r.rodovia, ...r })) : summary.data?.porClasse.map(r => ({ key: r.classe, ...r }));

  useEffect(() => { setPage(1); }, [classe, road, period, status, mode, dimension]);
  useEffect(() => { if (isPartial) setMode('com'); }, [isPartial]);
  useEffect(() => {
    if (!cooldown) return;
    const remaining = refreshUntil - Date.now();
    if (remaining <= 0) { setCooldown(false); return; }
    const timeout = setTimeout(() => setCooldown(false), remaining);
    return () => clearTimeout(timeout);
  }, [cooldown, refreshUntil]);
  useEffect(() => {
    if (detail && !dialog.current?.open) dialog.current?.showModal();
    if (!detail && dialog.current?.open) dialog.current?.close();
  }, [detail]);
  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController();
    setDetailLoading(true); setDetailError(''); setItems(null); setReports(null);
    if (!detail.asset && !detail.crossing && (detail.classe?.startsWith('Classe não ') || detail.rodovia === 'Rodovia não informada')) {
      setDetailLoading(false);
      setDetailError('O detalhamento de ativos sem classe ou rodovia identificada ainda não está disponível. As contagens deste grupo permanecem no resumo.');
      return () => controller.abort();
    }
    const query = new URLSearchParams({ concessao: company, page: String(detailPage), page_size: '100', ...(detail.classe && { classe: detail.classe }), ...(detail.rodovia && { rodovia: detail.rodovia }) });
    if (detail.asset) {
      void requestInventory<AssetReportings>(`${detail.asset.uuid}/apontamentos`, query.toString(), controller.signal).then(({ data }) => {
        if (!controller.signal.aborted && 'apontamentos' in data) setReports(data);
      }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Histórico indisponível.'); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    } else if (detail.crossing) {
      query.set('dimensao', 'ativo'); query.set('periodo', period); query.set('filtro', detail.mode || 'com');
      if (detail.status) query.set('status', detail.status);
      void followInventory<InventoryCrossing>('cruzamento', query.toString(), controller.signal, data => {
        if (data.status === 'pronto') { setItems(data); setDetailLoading(false); }
      }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Ativos indisponíveis.'); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    } else {
      void requestInventory<InventoryItems>('itens', query.toString(), controller.signal).then(({ data }) => {
        if (!controller.signal.aborted && 'itens' in data) setItems(data);
      }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Ativos indisponíveis.'); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    }
    return () => controller.abort();
  }, [company, detail, detailPage, period]);

  function openDetail(value: Detail) { setDetailPage(1); setDetail(value); }
  function groupDetail(key: string) { openDetail({ classe: dimension === 'classe' ? key : classe, rodovia: dimension === 'rodovia' ? key : road, crossing: view === 'cross', status, mode: 'com' }); }
  function reset() { setClasse(''); setRoad(''); setPeriod('recente'); setStatus(''); setMode('com'); setPage(1); }
  function refresh() { setRefreshUntil(Date.now() + 300_000); setCooldown(true); setRevision(value => value + 1); }
  const detailAssets = items ? 'itens' in items ? items.itens : items.linhas : [];
  const detailTotalPages = reports?.totalPaginas || items?.totalPaginas || 1;

  return <section className="mt-6 space-y-5" aria-label={`Inventário · ${name}`}>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Inventário da unidade</p><h3 className="mt-2 text-xl font-semibold text-surface-900">Conheça seus ativos. Acompanhe os vínculos.</h3><p className="mt-2 text-xs text-surface-600">{name} · Inventário atual e apontamentos vinculados.</p></div><button className={button} disabled={active.loading || Boolean(updating) || cooldown} title={cooldown ? 'Intervalo mínimo de cinco minutos entre atualizações.' : undefined} onClick={refresh}>{updating ? 'Atualização em andamento' : cooldown ? 'Atualização solicitada · aguarde 5 min' : 'Atualizar inventário'}</button></div>
    <div className="flex gap-3 border-b border-brand-100" aria-label="Visões do inventário">{[['summary', 'Resumo do inventário'], ['cross', 'Cruzamento com apontamentos']].map(([id, label]) => <button key={id} aria-pressed={view === id} className={`border-b-2 px-2 pb-3 text-xs font-semibold ${view === id ? 'border-brand-700 text-brand-700' : 'border-transparent text-surface-600'}`} onClick={() => { setView(id as 'summary' | 'cross'); if (id === 'summary' && dimension === 'ativo') setDimension('classe'); }}>{label}</button>)}</div>
    {result && <div className="space-y-2"><Quality name="Inventário" value={result.coleta.inventario} />{result.coleta.apontamentos && <Quality name="Apontamentos" value={result.coleta.apontamentos} />}{result.avisos.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">{result.avisos.map((warning, index) => <p key={index}>{warning}</p>)}</div>}</div>}
    <div className="flex flex-wrap items-end gap-3"><Field label="Classe do ativo"><select className={input} value={classe} onChange={e => setClasse(e.target.value)}><option value="">Todas as classes</option>{base.data?.porClasse.map(r => <option key={r.classe}>{r.classe}</option>)}</select></Field><Field label="Rodovia"><select className={input} value={road} onChange={e => setRoad(e.target.value)}><option value="">Todas as rodovias</option>{base.data?.porRodovia.map(r => <option key={r.rodovia}>{r.rodovia}</option>)}</select></Field>{view === 'cross' && <><Field label="Período dos apontamentos"><select className={input} value={period} onChange={e => setPeriod(e.target.value)}><option value="recente">Últimos 365 dias</option><option value="completo">Histórico completo</option></select></Field><Field label="Status dos apontamentos"><select className={input} value={status} disabled={mode === 'sem' && dimension === 'ativo'} onChange={e => { setStatus(e.target.value); if (e.target.value) setMode('com'); }}><option value="">Todos os status</option>{[...new Set([...(crossing.data?.statusEncontrados || []), ...(crossing.data?.linhas.flatMap(row => Object.keys(row.porStatus || {})) || []), ...(status ? [status] : [])])].sort().map(s => <option key={s}>{s}</option>)}</select></Field></>}<button className={`${button} border-transparent`} onClick={reset}>Limpar filtros</button></div>
    {active.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{active.error}</p><button className={`${button} mt-3`} onClick={() => setRevision(v => v + 1)}>Tentar novamente</button>{result && <p className="mt-2 text-xs">Exibindo o último resultado recebido para estes filtros.</p>}</div>}
    {active.processing && !result && <div role="status" className="rounded-2xl border border-brand-100 bg-brand-50 p-9 text-center"><div className="mx-auto mb-5 h-7 w-7 animate-spin rounded-full border-2 border-brand-100 border-t-brand-700 motion-reduce:animate-none" /><h4 className="font-semibold">Preparando {view === 'summary' ? 'o inventário' : 'o cruzamento'} da unidade</h4><p className="mt-3 text-xs leading-6">Etapa: {active.processing.etapa} · {active.processing.decorridoSeg} segundos decorridos.<br />A coleta continua no servidor. A tela acompanha o resultado automaticamente.</p></div>}
    {active.loading && !active.processing && !result && <p role="status" className="rounded-2xl bg-brand-50 p-8 text-center text-sm text-brand-700">Consultando {view === 'summary' ? 'inventário' : 'cruzamento'}…</p>}
    {result && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{view === 'summary' && summary.data ? <><Metric label={isPartial ? 'Ativos recebidos no recorte' : 'Ativos no recorte'} value={number(summary.data.totalFiltrado)} note={`${number(summary.data.totalRecebido)} recebidos de ${number(summary.data.totalInventarioConcessao)} esperados na concessão`} /><Metric label="Ativos com foto" value={number(summary.data.comFoto)} note="Ao menos uma foto cadastrada" /><Metric label="Cobertura de fotos" value={percent(summary.data.pctComFoto)} note={isPartial ? 'Aguardando coleta completa' : 'Ativos com foto ÷ ativos no recorte'} /><Metric label="Classes no recorte" value={number(summary.data.porClasse.length)} note={`Em ${number(summary.data.porRodovia.length)} rodovias`} /></> : crossing.data ? <><Metric label="Ativos no recorte" value={number(crossing.data.totais.ativosNoRecorte)} note="Considera classe e rodovia" /><Metric label="Com apontamento no período" value={number(crossing.data.totais.ativosComApontamento)} note="Considera qualquer status" /><Metric label="Sem apontamento no período" value={number(crossing.data.totais.ativosSemApontamento)} note="Sem vínculo encontrado na janela" /><Metric label="Cobertura de apontamentos" value={percent(crossing.data.totais.pctAtivosComApontamento)} note={`${number(crossing.data.totais.apontamentosNoRecorte)} apontamentos no recorte`} /></> : null}</div>
      {view === 'summary' ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/50 p-5"><div><h4 className="text-sm font-semibold">Quais ativos têm apontamentos?</h4><p className="mt-2 text-xs leading-6 text-surface-600">Consulte os vínculos por período, classe e rodovia.</p></div><button className={primaryButton} onClick={() => setView('cross')}>Consultar cruzamento →</button></div> : <div className="space-y-2 text-xs text-surface-600"><p>Inventário atual × {period === 'recente' ? `apontamentos desde ${crossing.data?.janelaDesde || 'o início da janela de 365 dias'}` : 'todo o histórico disponível'}.</p>{status && crossing.data && <p className="rounded-xl border border-brand-100 bg-brand-50 p-3"><strong>{status}:</strong> {number(crossing.data.totais.ativosComApontamentoNoStatus)} ativos · {number(crossing.data.totais.apontamentosNoStatus)} apontamentos neste status. A presença acima considera todos os status.</p>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">{view === 'summary' ? 'Distribuição dos ativos' : 'Ativos e apontamentos'}</h4><p className="mt-1 text-xs text-surface-600">Selecione um grupo ou ativo para abrir os detalhes.</p></div><div className="flex gap-1 rounded-xl bg-brand-50 p-1">{[['classe', 'Por classe'], ['rodovia', 'Por rodovia'], ...(view === 'cross' ? [['ativo', 'Por ativo']] : [])].map(([id, label]) => <button key={id} aria-pressed={dimension === id} className={`rounded-lg px-3 py-2 text-xs ${dimension === id ? 'bg-white font-semibold text-brand-700 shadow-soft' : 'text-surface-600'}`} onClick={() => setDimension(id as typeof dimension)}>{label}</button>)}</div></div>
      {view === 'cross' && dimension === 'ativo' && <div className="flex flex-wrap items-center gap-3"><button className={button} aria-pressed={mode === 'com'} onClick={() => setMode('com')}>Com apontamento</button><button className={button} aria-pressed={mode === 'sem'} disabled={isPartial} title={isPartial ? 'Exige as duas fontes completas.' : undefined} onClick={() => { setMode('sem'); setStatus(''); }}>Sem apontamento</button>{isPartial && <p className="text-xs text-amber-700">“Sem apontamento” exige coleta completa.</p>}</div>}
      <div className="overflow-x-auto rounded-xl border border-brand-100"><table className="min-w-full whitespace-nowrap text-left text-xs"><thead className="bg-brand-50/60 text-[10px] text-surface-600">{view === 'summary' ? <tr><th className="p-4">{dimension === 'rodovia' ? 'Rodovia' : 'Classe do ativo'}</th><th className="p-4">Ativos</th><th className="p-4">Com foto</th><th className="p-4">Cobertura de fotos</th></tr> : dimension === 'ativo' ? <tr><th className="p-4">Ativo</th><th className="p-4">Classe / Rodovia</th><th className="p-4">Km</th><th className="p-4">Apontamentos</th>{status && <th className="p-4">No status</th>}</tr> : <tr><th className="p-4">{dimension === 'rodovia' ? 'Rodovia' : 'Classe do ativo'}</th><th className="p-4">Ativos</th><th className="p-4">Com apontamento</th><th className="p-4">Sem apontamento</th><th className="p-4">Cobertura</th><th className="p-4">Apontamentos</th>{status && <><th className="p-4">Ativos no status</th><th className="p-4">Apont. no status</th></>}</tr>}</thead><tbody>{view === 'summary' ? summaryRows?.map(row => <tr className="border-t border-brand-50 hover:bg-brand-50/30" key={row.key}><td className="p-4"><button className="text-left font-semibold text-brand-700 hover:underline" onClick={() => groupDetail(row.key)}>{row.key} →</button></td><td className="p-4">{number(row.total)}</td><td className="p-4">{number(row.comFoto)}</td><td className="p-4">{percent(row.pctComFoto)}</td></tr>) : crossing.data?.linhas.map((row, index) => dimension === 'ativo' ? <tr key={row.uuid} className="border-t border-brand-50 hover:bg-brand-50/30"><td className="p-4"><button className="font-semibold text-brand-700 hover:underline" onClick={() => openDetail({ asset: row, classe, rodovia: road, crossing: true, status, mode })}>{row.numero || row.uuid} →</button></td><td className="p-4">{row.classe || '—'}<span className="mt-1 block text-surface-600">{row.rodovia || '—'}</span></td><td className="p-4">{row.km ?? '—'}</td><td className="p-4">{number(row.apontamentos)}</td>{status && <td className="p-4">{number(row.apontamentosNoStatus)}</td>}</tr> : <tr key={`${row.classe || row.rodovia}-${index}`} className="border-t border-brand-50 hover:bg-brand-50/30"><td className="p-4"><button className="font-semibold text-brand-700 hover:underline" onClick={() => groupDetail((dimension === 'classe' ? row.classe : row.rodovia) || '')}>{(dimension === 'classe' ? row.classe : row.rodovia) || '—'} →</button></td><td className="p-4">{number(row.ativos)}</td><td className="p-4">{number(row.ativosComApontamento)}</td><td className="p-4">{number(row.ativosSemApontamento)}</td><td className="p-4">{percent(row.pctAtivosComApontamento)}</td><td className="p-4">{number(row.apontamentos)}</td>{status && <><td className="p-4">{number(row.ativosComApontamentoNoStatus)}</td><td className="p-4">{number(row.apontamentosNoStatus)}</td></>}</tr>)}</tbody></table>{(view === 'summary' ? !summaryRows?.length : !crossing.data?.linhas.length) && <p className="p-8 text-center text-xs text-surface-600">{isPartial ? 'Nenhum registro recebido neste recorte. A coleta parcial não comprova ausência.' : 'Nenhum ativo encontrado neste recorte.'}</p>}</div>
      {view === 'cross' && dimension === 'ativo' && <div className="flex items-center justify-between gap-3 text-xs"><span>{number(crossing.data?.totalLinhas)} ativos encontrados</span><div className="flex items-center gap-3"><button className={button} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>{page} de {crossing.data?.totalPaginas || 1}</span><button className={button} disabled={page >= (crossing.data?.totalPaginas || 1)} onClick={() => setPage(p => p + 1)}>Próxima</button></div></div>}
      <p className="border-t border-brand-100 pt-4 text-[11px] leading-6 text-surface-600">{view === 'summary' ? 'Classe e rodovia são atributos do ativo. Os indicadores refletem o recorte selecionado.' : 'Ter apontamento vinculado não comprova inspeção ou manutenção. “Sem apontamento” significa nenhum vínculo encontrado na janela; registros sem vínculo não entram nessa cobertura.'}</p>
    </>}
    <dialog ref={dialog} onCancel={() => setDetail(null)} onClose={() => setDetail(null)} aria-labelledby="inventory-detail-title" className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl border-0 bg-white p-0 text-surface-900 shadow-panel backdrop:bg-black/30"><div className="p-5 sm:p-7"><header className="flex items-center justify-between gap-4 border-b border-brand-100 pb-5"><div><p className="text-[10px] uppercase tracking-wider text-brand-700">{name}</p><h3 id="inventory-detail-title" className="mt-2 text-xl font-semibold">{detail?.asset ? 'Histórico do ativo' : 'Ativos do inventário'}</h3></div><button className={button} aria-label="Fechar detalhes" onClick={() => setDetail(null)}>✕</button></header>{detail?.asset ? <><button className={`${button} my-4`} onClick={() => { setDetailPage(1); setDetail({ ...detail, asset: undefined }); }}>← Voltar aos ativos</button><div className="rounded-2xl border border-brand-100 bg-brand-50 p-5"><h4 className="font-semibold">{detail.asset.numero || detail.asset.uuid}</h4><p className="mt-2 text-xs">{detail.asset.classe || 'Classe não informada'} · {detail.asset.rodovia || 'Rodovia não informada'} · Km {detail.asset.km ?? '—'}</p>{safeKartadoLink(detail.asset.link || null) && <a className="mt-3 inline-block text-xs font-semibold text-brand-700 underline" target="_blank" rel="noopener noreferrer" href={safeKartadoLink(detail.asset.link || null)!}>Abrir ativo no Kartado ↗</a>}</div><p className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">Histórico completo do ativo, incluindo registros fora do período e do status selecionados no cruzamento.</p></> : <p className="my-4 text-xs leading-6 text-surface-600">{detail?.classe || 'Todas as classes'} · {detail?.rodovia || 'Todas as rodovias'}{detail?.crossing ? ` · ${detail.mode === 'sem' ? 'Sem' : 'Com'} apontamento no período${detail.status ? ` · ${detail.status}` : ''}` : ''}</p>}{detailLoading && <p role="status" className="py-6 text-sm text-brand-700">Carregando detalhes…</p>}{detailError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">{detailError}</p>}{reports?.avisos.map((warning, index) => <p key={index} className="my-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>)}{items && 'coletaCompleta' in items && !items.coletaCompleta && <p className="my-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Coleta parcial: esta lista contém somente os ativos recebidos.</p>}{!detail?.asset && detailAssets.map(a => <button key={a.uuid} className="flex w-full items-center justify-between gap-4 border-b border-brand-50 py-4 text-left hover:bg-brand-50/40" onClick={() => { setDetailPage(1); setDetail(current => current ? { ...current, asset: a } : null); }}><div><strong className="text-sm text-brand-700">{a.numero || a.uuid}</strong><p className="mt-2 text-xs text-surface-600">{a.classe || '—'} · {a.rodovia || '—'} · Km {a.km ?? '—'}</p></div><span>→</span></button>)}{reports?.apontamentos.map(r => <article key={r.uuid} className="border-b border-brand-50 py-4"><div className="flex flex-wrap justify-between gap-3"><strong className="text-sm">{r.numero || r.uuid}</strong><span className="rounded-lg bg-brand-50 px-2 py-1 text-[10px] text-brand-700">{r.status || 'Status não informado'}</span></div><p className="mt-2 text-xs text-surface-600">{r.classe || '—'} · {r.dataCriacao || 'Data não informada'}</p>{safeKartadoLink(r.link) && <a className="mt-3 inline-block text-xs font-semibold text-brand-700 underline" target="_blank" rel="noopener noreferrer" href={safeKartadoLink(r.link)!}>Abrir apontamento no Kartado ↗</a>}</article>)}{!detailLoading && !detailError && (detail?.asset ? reports && !reports.apontamentos.length : items && !detailAssets.length) && <p className="py-7 text-center text-xs text-surface-600">Nenhum registro encontrado nesta consulta.</p>}{(items || reports) && <div className="mt-5 flex items-center justify-between gap-2 text-xs"><button className={button} disabled={detailLoading || detailPage <= 1} onClick={() => setDetailPage(p => p - 1)}>Anterior</button><span>{detailPage} de {detailTotalPages}</span><button className={button} disabled={detailLoading || detailPage >= detailTotalPages} onClick={() => setDetailPage(p => p + 1)}>Próxima</button></div>}</div></dialog>
  </section>;
}
