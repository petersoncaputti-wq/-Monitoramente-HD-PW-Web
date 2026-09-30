import { useEffect, useMemo, useRef, useState } from 'react';
import { KartadoAuditCharts } from './KartadoAuditCharts';
import {
  AuditRequestError, getActiveAuditJob, getAuditCompanies, getAuditJob, getAuditOrigins, getAuditResult, startAuditJob,
  type AuditCompany, type AuditOrigin, type AuditParams, type AuditResult,
} from '@/services/kartadoAuditService';
import { auditCounts, auditOverdue, auditStatus, auditToday, emptyAuditFilters, filterAuditItems, safeKartadoLink, type AuditFilters } from '@/utils/kartadoAudit';

const field = 'min-w-0 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500';
const secondary = 'rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-50';
const primary = 'rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const number = (value: number) => value.toLocaleString('pt-BR');
const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'Não informada';
const message = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a consulta.';
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => { window.clearTimeout(timer); reject(new DOMException('Consulta interrompida', 'AbortError')); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
  });
}

export function KartadoAuditReportings({ initialCompany }: { initialCompany: string }) {
  const [companies, setCompanies] = useState<AuditCompany[]>([]);
  const [company, setCompany] = useState(initialCompany);
  const [origin, setOrigin] = useState('');
  const [period, setPeriod] = useState<'recente' | 'completo'>('recente');
  const [origins, setOrigins] = useState<AuditOrigin[]>([]);
  const [originsLoading, setOriginsLoading] = useState(false);
  const [originsError, setOriginsError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [catalogReload, setCatalogReload] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [resultCompany, setResultCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AuditFilters>({ ...emptyAuditFilters });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const requestRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const storageKey = 'kartado-audit-active-job';

  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    getAuditCompanies(controller.signal).then(data => setCompanies(data.concessoes)).catch(reason => {
      if (!controller.signal.aborted) setCatalogError(message(reason));
    });
    return () => controller.abort();
  }, [catalogReload]);

  useEffect(() => {
    const controller = new AbortController();
    setOrigins([]); setOriginsError('');
    if (!company) return () => controller.abort();
    setOriginsLoading(true);
    getAuditOrigins(company, controller.signal).then(data => {
      if (!controller.signal.aborted) setOrigins(data.origensAmostra);
    }).catch(reason => { if (!controller.signal.aborted) setOriginsError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setOriginsLoading(false); });
    return () => controller.abort();
  }, [company, catalogReload]);

  function remember(id: string | null) {
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch { /* Navegadores sem armazenamento ainda podem consultar. */ }
  }

  async function followJob(id: string, controller: AbortController, current: number) {
    const signal = controller.signal;
    let failures = 0;
    const started = Date.now();
    while (!signal.aborted && sequence.current === current) {
      if (Date.now() - started > 40 * 60_000) throw new Error('O acompanhamento excedeu o tempo disponível. Reabra a aba para verificar a consulta.');
      try {
        const job = await getAuditJob(id, signal);
        if (signal.aborted || sequence.current !== current) return;
        setCompany(job.params.concessao); setOrigin(job.params.origem); setPeriod(job.params.periodo);
        if (job.status === 'failed') {
          remember(null);
          const retry = job.retry_at ? Math.max(0, Math.ceil((new Date(job.retry_at).getTime() - Date.now()) / 1000)) : 0;
          throw new AuditRequestError(job.error || 'A consulta não pôde ser concluída.', 422, retry);
        }
        if (job.status === 'completed') {
          const next = await getAuditResult(id, signal);
          if (signal.aborted || sequence.current !== current) return;
          setResult(next); setResultCompany(job.params.concessao);
          setOrigins(next.origensDisponiveis); setFilters({ ...emptyAuditFilters }); setPage(1);
          remember(null); return;
        }
        failures = 0;
        setProgress(job.status === 'queued' ? 'Consulta na fila. Aguardando disponibilidade.' : 'Buscando apontamentos. A primeira consulta pode levar vários minutos. Você pode navegar para outras abas.');
        await pause(3000, signal);
      } catch (reason) {
        if (signal.aborted) throw reason;
        if (reason instanceof AuditRequestError && [400, 401, 403, 404, 422].includes(reason.status)) { remember(null); throw reason; }
        if (++failures > 3) throw reason;
        setProgress('Comunicação interrompida. Tentando acompanhar a consulta novamente...');
        await pause(reason instanceof AuditRequestError && reason.retryAfter ? reason.retryAfter * 1000 : 5000, signal);
      }
    }
  }

  async function execute(params?: AuditParams, existingId?: string) {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const current = ++sequence.current;
    setBusy(true); setError(''); setResult(null); setProgress('Iniciando consulta...');
    try {
      const id = existingId || (await startAuditJob(params!, controller.signal)).id;
      remember(id);
      await followJob(id, controller, current);
    } catch (reason) {
      if (!controller.signal.aborted && sequence.current === current) {
        setError(message(reason));
        if (reason instanceof AuditRequestError && reason.retryAfter) setRetryAt(Date.now() + reason.retryAfter * 1000);
      }
    } finally {
      if (!controller.signal.aborted && sequence.current === current) { setBusy(false); setProgress(''); setRefreshRequested(false); }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const current = sequence.current;
    let id: string | null = null;
    try { id = sessionStorage.getItem(storageKey); } catch { /* Sem persistência local. */ }
    if (id) void execute(undefined, id);
    else void getActiveAuditJob(controller.signal).then(({ job }) => {
      if (job && !controller.signal.aborted && sequence.current === current) void execute(undefined, job.id);
    }).catch(() => { /* A consulta normal apresenta erros de configuração/conexão. */ });
    return () => { controller.abort(); sequence.current++; requestRef.current?.abort(); };
  }, []);

  const visible = useMemo(() => filterAuditItems(result?.items || [], filters), [result, filters]);
  const today = auditToday();
  const counts = useMemo(() => auditCounts(visible, today), [visible, today]);
  const options = useMemo(() => {
    const distinct = (key: 'status' | 'natureza' | 'rodovia', fallback: string) => [...new Set((result?.items || []).map(item => item[key] || fallback))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { status: distinct('status', 'Não informado'), nature: distinct('natureza', 'Não informada'), road: distinct('rodovia', 'Não informada') };
  }, [result]);
  const partial = Boolean(result && result.fetchFailedPages > 0);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const name = companies.find(item => item.uuid === resultCompany)?.nome || resultCompany;
  const waiting = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const dirty = Boolean(result && (result.companyUuid !== company || result.origem !== origin.trim() || result.periodo !== period));
  const updateFilter = (key: keyof AuditFilters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };

  return <section className="mt-6 space-y-5" aria-label="Consulta de apontamentos">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Consulta por origem</p><h3 className="mt-1 text-xl font-semibold text-surface-900">Apontamentos</h3><p className="mt-1 text-sm text-surface-600">Consulte uma origem e explore os registros encontrados.</p></div>
      {result ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${partial ? 'bg-amber-100 text-amber-900' : 'bg-brand-50 text-brand-700'}`}>{partial ? 'Resultado parcial' : 'Consulta concluída'}</span> : null}
    </div>
    {catalogError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{catalogError}<button type="button" className={`${secondary} ml-3`} onClick={() => setCatalogReload(value => value + 1)}>Tentar novamente</button></div> : null}
    <form onSubmit={event => { event.preventDefault(); void execute({ concessao: company, origem: origin.trim(), periodo: period, refresh: refreshRequested }); }} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="grid gap-1 text-xs font-medium text-surface-700">Concessão<select className={field} value={company} onChange={event => { setCompany(event.target.value); setOrigin(''); }} required><option value="">Selecione</option>{companies.map(item => <option key={item.uuid} value={item.uuid}>{item.nome}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-surface-700">Origem<input className={field} list="audit-origin-options" value={origin} onChange={event => setOrigin(event.target.value)} placeholder={originsLoading ? 'Carregando sugestões...' : 'Selecione ou digite a origem exata'} maxLength={200} required /><datalist id="audit-origin-options">{origins.map(item => <option key={item.origem} value={item.origem} />)}</datalist></label>
        <label className="grid gap-1 text-xs font-medium text-surface-700">Período da consulta<select className={field} value={period} onChange={event => setPeriod(event.target.value as 'recente' | 'completo')}><option value="recente">Últimos 12 meses</option><option value="completo">Histórico completo</option></select></label>
        <button className={`${primary} self-end`} type="submit" disabled={!company || !origin.trim() || waiting > 0 || !companies.length}>{busy ? 'Consultando...' : waiting ? `Aguarde ${waiting}s` : 'Buscar'}</button>
      </fieldset>
      <p className="mt-3 text-xs leading-5 text-surface-600">A origem é obrigatória. As sugestões iniciais são uma amostra; você também pode digitar uma origem que não apareceu na lista.</p>
      {originsError ? <p className="mt-2 text-xs text-amber-800">Sugestões indisponíveis: {originsError} Você ainda pode informar a origem manualmente.</p> : null}
      {period === 'completo' ? <p className="mt-2 text-sm text-amber-800">O histórico completo pode levar mais de dez minutos. A busca começa somente ao clicar em Buscar.</p> : null}
      <label className="mt-3 flex items-start gap-2 text-xs text-surface-600"><input type="checkbox" checked={refreshRequested} disabled={busy} onChange={event => setRefreshRequested(event.target.checked)} className="mt-0.5" />Buscar novamente na origem, sem reutilizar o resultado em cache (mais demorado).</label>
    </form>
    {busy ? <div role="status" className="rounded-2xl border border-brand-100 bg-brand-50 p-5 text-sm text-brand-800"><span className="mr-2 inline-block h-3 w-3 rounded-full bg-brand-600 motion-safe:animate-pulse" />{progress}</div> : null}
    {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<p className="mt-1">Se a busca já tiver sido iniciada, reabra esta aba para retomar o acompanhamento.</p></div> : null}
    {!result && !busy && !error ? <p className="rounded-2xl border border-dashed border-brand-200 p-8 text-center text-sm text-surface-600">Escolha a concessão, informe a origem e clique em Buscar.</p> : null}
    {result ? <>
      <div className="space-y-2 text-sm text-surface-700"><p className="font-semibold">{name} · {result.origem} · {result.periodo === 'completo' ? 'Histórico completo' : `Desde ${date(result.janelaDesde)}`}</p><p className="text-xs">Consulta concluída em {new Date(result.retrievedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília). {result.fromCache ? `Resultado em cache, com ${number(Math.max(0, Math.floor(result.cachedAgeSec || 0)))} segundos na conclusão da consulta.` : 'Resultado buscado na origem.'}</p><p className="text-xs">Total informado da concessão na janela, antes do recorte: {number(result.totalConcessaoNaJanela)}. Registros recebidos para esta origem: {number(result.items.length)}.</p></div>
      {dirty ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Os filtros de consulta foram alterados. Clique em Buscar para atualizar; os resultados abaixo ainda correspondem à consulta identificada acima.</p> : null}
      {partial ? <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Resultado parcial: alguns registros não foram carregados.</strong><p className="mt-1">{number(result.fetchFailedPages)} página(s) falharam. Lista e indicadores consideram somente os registros recebidos, inclusive quando o resultado vem do cache. Para tentar recuperar os registros, marque a busca sem cache e clique em Buscar.</p></div> : null}
      {result.naturezasExcluidas.length ? <p className="rounded-xl bg-brand-50 p-3 text-xs text-surface-700">Exclusões aplicadas pela integração neste recorte: {result.naturezasExcluidas.join(', ')}.</p> : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
        ['Apontamentos no recorte', counts.total], ['Pendentes', counts.pending], ['Concluídos / executados', counts.completed], ['Pendentes vencidos', counts.overdue],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-brand-100 bg-white p-4"><p className="text-xs font-medium text-surface-600">{label}{partial ? ' · parcial' : ''}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-surface-900">{number(Number(value))}</p></div>)}</div>
      <details className="text-xs text-surface-600"><summary className="cursor-pointer">Como os indicadores são calculados{counts.other ? ` · ${number(counts.other)} registro(s) em outros status` : ''}</summary><p className="mt-2 leading-5">Todos os indicadores respeitam os filtros abaixo. Pendentes: Identificado, Em Execução, Pendente, Aberto ou Em andamento, sem data de execução. Concluídos: Executado, Concluído, Encerrado ou Finalizado. Demais situações ficam em outros status. Vencido: pendente com vencimento anterior à data de hoje em Brasília. Vencimento hoje não é considerado atrasado.</p></details>
      <div className="rounded-2xl border border-brand-100 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-surface-900">Filtrar registros carregados</h4><button type="button" className={secondary} onClick={() => { setFilters({ ...emptyAuditFilters }); setPage(1); }}>Limpar filtros</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-xs text-surface-700">Número, classe, natureza ou rodovia<input className={field} value={filters.search} onChange={event => updateFilter('search', event.target.value)} placeholder="Pesquisar nos resultados" /></label>
          {([['status', 'Status'], ['nature', 'Natureza'], ['road', 'Rodovia']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs text-surface-700">{label}<select className={field} value={filters[key]} onChange={event => updateFilter(key, event.target.value)}><option value="">Todos</option>{options[key].map(value => <option key={value}>{value}</option>)}</select></label>)}
          {result.trechoDisponivel ? <label className="grid gap-1 text-xs text-surface-700">Trecho<select className={field} value={filters.section} onChange={event => updateFilter('section', event.target.value)}><option value="">Todos</option><option>Norte</option><option>Sul</option><option>Não identificado</option></select></label> : null}
          <label className="grid gap-1 text-xs text-surface-700">Criado de<input type="date" className={field} max={filters.to || undefined} value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-surface-700">Criado até<input type="date" className={field} min={filters.from || undefined} value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
        </div><p className="mt-3 text-xs text-surface-600">As datas filtram a criação nos registros já recebidos. Não ampliam o período consultado e não equivalem à data em que a ocorrência foi encontrada.</p>
      </div>
      <KartadoAuditCharts items={visible} partial={partial} sectionAvailable={result.trechoDisponivel} />
      <div className="rounded-2xl border border-brand-100 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-surface-900">Apontamentos encontrados</h4><span className="text-xs text-surface-600" aria-live="polite">{number(visible.length)} de {number(result.items.length)} registros carregados</span></div>
        {!visible.length ? <p className="py-8 text-center text-sm text-surface-600">{result.items.length ? 'Nenhum registro corresponde aos filtros selecionados.' : partial ? 'Nenhum registro recebido. A consulta está incompleta.' : 'Nenhum apontamento encontrado para esta origem e período.'}</p> : null}
        {pageItems.map(item => {
          const overdue = auditOverdue(item, today); const status = auditStatus(item); const link = safeKartadoLink(item.link);
          return <details key={item.uuid} className="border-t border-brand-100 py-4">
            <summary className="cursor-pointer text-sm text-surface-900"><span className="inline-flex w-[95%] flex-col gap-3 align-top sm:flex-row sm:items-start sm:justify-between"><span className="min-w-0 w-full sm:flex-1"><strong className="break-words font-semibold">{item.numero || 'Sem número'} · {item.classe || item.natureza || 'Sem classificação'}</strong><span className="mt-1 block text-xs text-surface-600">{item.rodovia || 'Rodovia não informada'} · km {item.km ?? '—'}{result.trechoDisponivel ? ` · ${item.trecho || 'Trecho não identificado'}` : ''}</span></span><span className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'completed' ? 'bg-brand-50 text-brand-800' : status === 'pending' ? 'bg-amber-50 text-amber-900' : 'bg-surface-100 text-surface-700'}`}>{item.status || 'Status não informado'}</span>{overdue ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Vencido</span> : null}<span className="text-xs text-surface-600">Vencimento: {date(item.dataVencimento)}</span></span></span></summary>
            <dl className="mt-4 grid gap-3 rounded-xl bg-brand-50/50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
              ['Natureza', item.natureza], ['Classe', item.classe], ['Origem', item.origem], ['Criado em', date(item.dataCriacao)], ['Executado em', date(item.dataExecucao)], ['Vencimento', date(item.dataVencimento)], ['Km inicial / final', `${item.km ?? '—'} / ${item.kmFinal ?? '—'}`], ['Sentido de tráfego', item.sentido], ['Faixa', item.faixa], ...(result.trechoDisponivel ? [['Trecho', item.trecho]] : []),
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-surface-600">{label}</dt><dd className="mt-1 break-words text-surface-900">{value || 'Não informado'}</dd></div>)}</dl>
            {link ? <a className="mt-3 inline-flex rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700" href={link} target="_blank" rel="noopener noreferrer">Abrir no Kartado ↗</a> : null}
          </details>;
        })}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 pt-4"><label className="flex items-center gap-2 text-xs text-surface-600">Por página<select className={field} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[20, 40, 80].map(value => <option key={value}>{value}</option>)}</select></label><div className="flex items-center gap-3"><button type="button" className={secondary} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Anterior</button><span className="text-xs text-surface-600">{safePage} / {totalPages}</span><button type="button" className={secondary} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Próxima</button></div></div>
      </div>
    </> : null}
  </section>;
}
