import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { demoUnits, makeAssets, reportingsInPeriod, scenarios, type DemoAsset, type Scenario } from './inventory-data';

type IconName = 'grid' | 'layers' | 'arrow' | 'refresh' | 'check' | 'clock' | 'alert' | 'close' | 'search' | 'chevron';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Z" /><path d="m2 12 10 5 10-5M2 16l10 5 10-5" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const number = (n: number) => n.toLocaleString('pt-BR');
const percent = (n: number, total: number) => total ? `${(n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—';
const date = (value: string) => value.split('-').reverse().join('/');
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="iv-field"><span>{label}</span>{children}</label>; }
function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <article className={`iv-metric ${accent ? 'iv-metric-accent' : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
interface DetailFilter { classe?: string; rodovia?: string; mode?: 'all' | 'com' | 'sem'; status?: string }

export function InventoryPreview() {
  const [unit, setUnit] = useState(0);
  const [scenario, setScenario] = useState<Scenario>('complete');
  const [view, setView] = useState<'summary' | 'cross'>('summary');
  const [classe, setClasse] = useState('');
  const [rodovia, setRodovia] = useState('');
  const [dimension, setDimension] = useState<'classe' | 'rodovia' | 'ativo'>('classe');
  const [period, setPeriod] = useState('recente');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'com' | 'sem'>('com');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DetailFilter | null>(null);
  const [asset, setAsset] = useState<DemoAsset | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const partial = scenario === 'partial';
  const processing = scenario === 'processing';
  const empty = scenario === 'empty';
  const updating = refreshing || scenario === 'updating';
  const allAssets = useMemo(() => makeAssets(unit), [unit]);
  const assets = empty || processing ? [] : partial ? allAssets.slice(0, Math.floor(allAssets.length * .75)) : allAssets;
  const classes = [...new Set(allAssets.map(a => a.classe))].sort();
  const roads = [...new Set(allAssets.map(a => a.rodovia))].sort();
  const filtered = assets.filter(a => (!classe || a.classe === classe) && (!rodovia || a.rodovia === rodovia));
  const withPhoto = filtered.filter(a => a.fotos > 0).length;
  const periodReports = (a: DemoAsset) => reportingsInPeriod(a, period);
  const inStatus = (a: DemoAsset) => periodReports(a).filter(r => !status || r.status === status);
  const withReporting = filtered.filter(a => periodReports(a).length > 0);
  const reportingCount = filtered.reduce((sum, a) => sum + periodReports(a).length, 0);
  const groups = new Map<string, DemoAsset[]>();
  for (const a of filtered) {
    const key = dimension === 'rodovia' ? a.rodovia : a.classe;
    const group = groups.get(key) || []; group.push(a); groups.set(key, group);
  }
  const rows = [...groups.entries()].map(([key, items]) => ({ key, items, photos: items.filter(a => a.fotos > 0).length, withReporting: items.filter(a => periodReports(a).length).length, reports: items.reduce((n, a) => n + periodReports(a).length, 0), statusAssets: items.filter(a => inStatus(a).length).length, statusReports: items.reduce((n, a) => n + inStatus(a).length, 0) })).sort((a, b) => view === 'summary' ? b.items.length - a.items.length : status ? b.statusReports - a.statusReports : b.reports - a.reports);
  const visibleAssets = filtered.filter(a => (mode === 'sem' ? !periodReports(a).length : periodReports(a).length > 0 && (!status || inStatus(a).length > 0)) && (!search || `${a.numero} ${a.classe} ${a.rodovia}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))).sort((a, b) => status ? inStatus(b).length - inStatus(a).length : periodReports(b).length - periodReports(a).length);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(visibleAssets.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const detailAssets = detail ? assets.filter(a => (!detail.classe || a.classe === detail.classe) && (!detail.rodovia || a.rodovia === detail.rodovia) && (detail.mode === 'sem' ? !periodReports(a).length : detail.mode === 'com' ? periodReports(a).length > 0 && (!detail.status || periodReports(a).some(r => r.status === detail.status)) : true) && (!detailSearch || `${a.numero} ${a.classe} ${a.rodovia}`.toLocaleLowerCase('pt-BR').includes(detailSearch.toLocaleLowerCase('pt-BR')))) : [];

  useEffect(() => { setPage(1); }, [classe, rodovia, status, period, mode, dimension, search, unit, scenario]);
  useEffect(() => { if (partial) { setMode('com'); } }, [partial]);
  useEffect(() => { if (status) setMode('com'); }, [status]);
  useEffect(() => {
    if (detail && !dialog.current?.open) dialog.current?.showModal();
    if (!detail && dialog.current?.open) dialog.current?.close();
  }, [detail]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function changeUnit(value: number) { setUnit(value); setClasse(''); setRodovia(''); setSearch(''); setDetail(null); }
  function simulateRefresh() {
    setRefreshing(true);
    timer.current = setTimeout(() => { setRefreshing(false); setScenario('complete'); }, 1800);
  }
  function openDetails(filter: DetailFilter, selected: DemoAsset | null = null) { setAsset(selected); setDetailSearch(''); setDetail(filter); }
  function openGroup(key: string) {
    openDetails({ classe: dimension === 'rodovia' ? classe : key, rodovia: dimension === 'rodovia' ? key : rodovia, mode: view === 'summary' ? 'all' : 'com', ...(view === 'cross' && status ? { status } : {}) });
  }
  const qualityLabel = partial ? 'Coleta parcial' : scenario === 'stale' ? 'Dados desatualizados' : scenario === 'failed' ? 'Falha na atualização' : updating ? 'Atualização em andamento' : 'Coleta completa';

  return <div className="iv-app">
    <aside className="iv-sidebar">
      <div className="iv-logo"><span className="iv-logo-mark"><Icon name="layers" size={25} /></span><div>Monitoramento<small>Gestão de plataformas</small></div></div>
      <p className="iv-nav-caption">ESPAÇO DE TRABALHO</p>
      <div className="iv-nav-muted"><Icon name="grid" /> Visão geral</div>
      <div className="iv-nav-active"><Icon name="layers" /> Kartado <span>01</span></div>
      <div className="iv-nav-child">Auditoria por unidade</div>
      <div className="iv-sidebar-foot"><span className="iv-live-dot" /><div>Ambiente de demonstração<small>Prévia para validação visual</small></div></div>
    </aside>
    <div className="iv-body">
      <header className="iv-topbar"><span>Plataformas <span className="iv-slash">/</span> Kartado <span className="iv-slash">/</span> <strong>Inventário</strong></span><span className="iv-top-label">PRÉVIA DO PAINEL</span></header>
      <main className="iv-main">
        <section className="iv-demo" aria-label="Controles da demonstração"><div><span className="iv-demo-tag">DEMONSTRAÇÃO</span><p>Dados fictícios para validar a experiência. Todos os totais correspondem à amostra desta tela.</p></div><Field label="Simular cenário"><select value={scenario} onChange={e => { clearTimeout(timer.current); setRefreshing(false); setScenario(e.target.value as Scenario); }}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field></section>
        <div className="iv-heading"><div><div className="iv-eyebrow">KARTADO · AUDITORIA POR UNIDADE</div><h1>Conheça seus ativos.<br className="iv-mobile-break" /> Acompanhe os vínculos.</h1><p>Inventário e apontamentos, reunidos no contexto da sua concessão.</p></div><Field label="Unidade selecionada"><select value={unit} onChange={e => changeUnit(Number(e.target.value))}>{demoUnits.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></Field></div>
        <nav className="iv-unit-tabs" aria-label="Abas da unidade"><span>Visão geral</span><span>Usuários</span><span>Apontamentos</span><strong aria-current="page"><Icon name="layers" size={17} />Inventário <small>NOVO</small></strong><span>Alertas</span><span>Chamados</span></nav>
        <section className="iv-workspace">
          <div className="iv-section-heading"><div><h2>Inventário</h2><p>Explore a base de ativos e consulte seus apontamentos vinculados.</p></div><button className="iv-button" onClick={simulateRefresh} disabled={updating || processing}><Icon name="refresh" size={16} />{refreshing ? 'Simulando atualização…' : 'Simular atualização'}</button></div>
          <div className="iv-view-tabs" role="tablist" aria-label="Visões do inventário"><button id="iv-summary-tab" role="tab" aria-controls="iv-panel" aria-selected={view === 'summary'} onClick={() => { setView('summary'); if (dimension === 'ativo') setDimension('classe'); }}>Resumo do inventário</button><button id="iv-cross-tab" role="tab" aria-controls="iv-panel" aria-selected={view === 'cross'} onClick={() => setView('cross')}>Cruzamento com apontamentos</button></div>

          {processing ? <div className="iv-processing" role="status"><span className="iv-spinner" /><h3>Preparando o inventário da unidade</h3><p>A primeira consulta pode levar alguns minutos.<br />A coleta continua enquanto você navega no painel.</p><div>Etapa: inventário · 45 segundos decorridos</div><small>Cenário ilustrativo. Escolha “Dados completos” para continuar a demonstração.</small></div> : <div id="iv-panel" role="tabpanel" aria-labelledby={view === 'summary' ? 'iv-summary-tab' : 'iv-cross-tab'}>
            <div className={`iv-quality ${partial || scenario === 'stale' || scenario === 'failed' ? 'iv-quality-warning' : ''}`} role="status"><span className="iv-quality-icon"><Icon name={partial || scenario === 'failed' ? 'alert' : updating || scenario === 'stale' ? 'clock' : 'check'} /></span><div><strong>{qualityLabel}</strong><p>{partial ? `${number(assets.length)} de ${number(allAssets.length)} ativos recebidos. Contagens mínimas; percentuais e conclusões de ausência indisponíveis.` : scenario === 'failed' ? 'A última coleta completa foi preservada. A nova tentativa ficará disponível após o intervalo de 5 minutos.' : scenario === 'stale' ? 'Último resultado completo preservado. Solicite uma atualização para consultar dados mais recentes.' : updating ? 'Os dados da última coleta completa continuam disponíveis enquanto a atualização acontece.' : 'Inventário completo na amostra. Integridade e atualização são acompanhadas por fonte.'}</p></div><span className="iv-quality-date">Coleta de exemplo<br /><strong>{scenario === 'stale' || scenario === 'failed' ? '21/10/2026 · 08:40' : '22/10/2026 · 10:32'}</strong><small>Horário de Brasília</small></span></div>
            {view === 'cross' && <div className="iv-period-note"><Icon name="clock" size={16} /><span><strong>Fontes do cruzamento:</strong> inventário atual · apontamentos coletados em 22/10/2026 às 10:35. {period === 'recente' ? 'Janela de 365 dias: 22/10/2025 a 22/10/2026.' : 'Todo o histórico disponível na amostra.'}</span></div>}
            <div className="iv-filters"><Field label="Classe do ativo"><select value={classe} onChange={e => setClasse(e.target.value)}><option value="">Todas as classes</option>{classes.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Rodovia"><select value={rodovia} onChange={e => setRodovia(e.target.value)}><option value="">Todas as rodovias</option>{roads.map(r => <option key={r}>{r}</option>)}</select></Field>{view === 'cross' && <><Field label="Período dos apontamentos"><select value={period} onChange={e => setPeriod(e.target.value)}><option value="recente">Últimos 365 dias</option><option value="completo">Histórico completo</option></select></Field><Field label="Status dos apontamentos"><select value={status} disabled={mode === 'sem' && dimension === 'ativo'} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option><option>Executado</option><option>Programado</option><option>Em andamento</option></select></Field></>}<button className="iv-text-button iv-reset" onClick={() => { setClasse(''); setRodovia(''); setStatus(''); setPeriod('recente'); setMode('com'); setSearch(''); }}>Limpar filtros</button></div>
            {view === 'summary' ? <div className="iv-metrics"><Metric label={partial ? 'Ativos recebidos no recorte' : 'Ativos no recorte'} value={number(filtered.length)} note={`${number(assets.length)} ativos recebidos na unidade`} accent /><Metric label="Ativos com foto" value={number(withPhoto)} note="Ao menos uma foto cadastrada" /><Metric label="Cobertura de fotos" value={partial ? 'Indisponível' : percent(withPhoto, filtered.length)} note={partial ? 'Aguardando coleta completa' : 'Ativos com foto ÷ ativos no recorte'} /><Metric label="Classes no recorte" value={number(new Set(filtered.map(a => a.classe)).size)} note={`Em ${number(new Set(filtered.map(a => a.rodovia)).size)} rodovias da amostra`} /></div> : <div className="iv-metrics"><Metric label="Ativos no recorte" value={number(filtered.length)} note="Considera classe e rodovia" accent /><Metric label="Com apontamento no período" value={number(withReporting.length)} note="Considera qualquer status" /><Metric label="Sem apontamento no período" value={partial ? 'Indisponível' : number(filtered.length - withReporting.length)} note={partial ? 'Exige as duas fontes completas' : 'Sem vínculo encontrado na janela'} /><Metric label="Cobertura de apontamentos" value={partial ? 'Indisponível' : percent(withReporting.length, filtered.length)} note={`${number(reportingCount)} apontamentos vinculados no recorte`} /></div>}
            {view === 'cross' && status && <div className="iv-status-scope"><strong>{status}</strong><span>{number(filtered.filter(a => inStatus(a).length).length)} ativos com apontamento neste status</span><span>{number(filtered.reduce((n, a) => n + inStatus(a).length, 0))} apontamentos neste status</span><small>Os indicadores de presença acima continuam considerando todos os status.</small></div>}

            {view === 'summary' && <div className="iv-cross-prompt"><div className="iv-cross-symbol"><Icon name="layers" size={25} /></div><div><h3>Quais ativos têm apontamentos?</h3><p>Cruze o inventário com os registros do período e identifique ativos sem vínculo encontrado.</p></div><button className="iv-button iv-button-primary" onClick={() => setView('cross')}>Consultar cruzamento <Icon name="arrow" size={17} /></button></div>}
            <div className="iv-table-heading"><div><h3>{view === 'summary' ? 'Distribuição dos ativos' : 'Ativos e apontamentos'}</h3><p>{dimension === 'ativo' ? 'Selecione um ativo para consultar seu histórico.' : 'Selecione uma linha para explorar os ativos deste grupo.'}</p></div><div className="iv-segment" role="group" aria-label="Agrupar por"><button aria-pressed={dimension === 'classe'} onClick={() => setDimension('classe')}>Por classe</button><button aria-pressed={dimension === 'rodovia'} onClick={() => setDimension('rodovia')}>Por rodovia</button>{view === 'cross' && <button aria-pressed={dimension === 'ativo'} onClick={() => setDimension('ativo')}>Por ativo</button>}</div></div>
            {view === 'cross' && dimension === 'ativo' && <div className="iv-asset-tools"><div className="iv-segment" role="group" aria-label="Presença de apontamentos"><button aria-pressed={mode === 'com'} onClick={() => setMode('com')}>Com apontamento</button><button disabled={partial} title={partial ? 'Coleta parcial: não é possível afirmar ausência.' : undefined} aria-pressed={mode === 'sem'} onClick={() => { setMode('sem'); setStatus(''); }}>Sem apontamento</button></div><label className="iv-search"><Icon name="search" size={17} /><input aria-label="Buscar ativo" placeholder="Buscar número, classe ou rodovia" value={search} onChange={e => setSearch(e.target.value)} /></label>{partial && <small>“Sem apontamento” exige coleta completa.</small>}</div>}
            <div className="iv-table-scroll"><table className="iv-table"><thead>{dimension === 'ativo' && view === 'cross' ? <tr><th>Ativo</th><th>Classe / Rodovia</th><th>Km</th><th>Apontamentos</th>{status && <th>No status</th>}<th><span className="iv-sr-only">Detalhes</span></th></tr> : <tr><th>{dimension === 'rodovia' ? 'Rodovia' : 'Classe do ativo'}</th><th>Ativos</th>{view === 'summary' ? <><th>Com foto</th><th>Cobertura de fotos</th><th>Participação no recorte</th></> : <><th>Com apontamento</th><th>Sem apontamento</th><th>Cobertura</th><th>Apontamentos</th>{status && <><th>Ativos no status</th><th>Apont. no status</th></>}</>}<th><span className="iv-sr-only">Detalhes</span></th></tr>}</thead><tbody>
              {dimension === 'ativo' && view === 'cross' ? visibleAssets.slice((safePage - 1) * pageSize, safePage * pageSize).map(a => <tr key={a.uuid}><td><button className="iv-row-link" onClick={() => openDetails({ classe, rodovia, mode, status }, a)}>{a.numero}</button></td><td>{a.classe}<small>{a.rodovia}</small></td><td>{a.km.toLocaleString('pt-BR')}</td><td>{periodReports(a).length}</td>{status && <td>{inStatus(a).length}</td>}<td><button className="iv-icon-button" aria-label={`Abrir ${a.numero}`} onClick={() => openDetails({ classe, rodovia, mode, status }, a)}><Icon name="chevron" size={17} /></button></td></tr>) : rows.map(row => <tr key={row.key}><td><button className="iv-row-link" onClick={() => openGroup(row.key)}>{row.key}</button></td><td className="iv-cell-number">{row.items.length}</td>{view === 'summary' ? <><td>{row.photos}</td><td>{partial ? <span className="iv-null">Indisponível</span> : percent(row.photos, row.items.length)}</td><td><div className="iv-share"><div><span style={{ width: filtered.length ? `${row.items.length / filtered.length * 100}%` : '0%' }} /></div><span>{percent(row.items.length, filtered.length)}{partial ? ' dos recebidos' : ''}</span></div></td></> : <><td>{row.withReporting}</td><td>{partial ? <span className="iv-null">—</span> : row.items.length - row.withReporting}</td><td>{partial ? <span className="iv-null">—</span> : percent(row.withReporting, row.items.length)}</td><td>{row.reports}</td>{status && <><td>{row.statusAssets}</td><td>{row.statusReports}</td></>}</>}<td><button className="iv-icon-button" aria-label={`Explorar ${row.key}`} onClick={() => openGroup(row.key)}><Icon name="chevron" size={17} /></button></td></tr>)}
            </tbody></table>{(dimension === 'ativo' && view === 'cross' ? !visibleAssets.length : !rows.length) && <div className="iv-empty"><Icon name="search" size={26} /><h3>{empty ? 'Nenhum ativo cadastrado nesta amostra' : 'Nenhum ativo encontrado'}</h3><p>{empty ? 'A consulta foi concluída e retornou um inventário vazio.' : 'Experimente outra combinação de filtros.'}</p></div>}</div>
            <div className="iv-table-footer"><span>{dimension === 'ativo' && view === 'cross' ? `${number(visibleAssets.length)} ativos encontrados` : `${number(rows.length)} grupos · ${number(filtered.length)} ativos ${partial ? 'recebidos' : 'no recorte'}`}</span>{dimension === 'ativo' && view === 'cross' ? <div className="iv-pagination"><button className="iv-button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Anterior</button><span>{safePage} de {totalPages}</span><button className="iv-button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Próxima</button></div> : <button className="iv-text-button" onClick={() => openDetails({ classe, rodovia, mode: view === 'summary' ? 'all' : 'com', ...(view === 'cross' && status ? { status } : {}) })}>Ver ativos {view === 'cross' ? 'com apontamento' : 'do recorte'} <Icon name="arrow" size={15} /></button>}</div>
            <p className="iv-method-note">{view === 'summary' ? 'Classe e rodovia são atributos do ativo. Os indicadores refletem os filtros selecionados.' : 'Ter apontamento vinculado não comprova inspeção ou manutenção. “Sem apontamento” significa nenhum vínculo encontrado no período; registros sem vínculo não entram nessa cobertura.'}</p>
          </div>}
        </section>
        <footer className="iv-page-footer"><span>Monitoramento de plataformas · Kartado</span><span>Protótipo interativo · dados fictícios · 22/10/2026</span></footer>
      </main>
    </div>
    <dialog ref={dialog} className="iv-dialog" onCancel={() => setDetail(null)} onClose={() => setDetail(null)} onClick={e => { if (e.target === dialog.current) { const box = dialog.current.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) setDetail(null); } }} aria-labelledby="iv-detail-title"><div className="iv-drawer">
      <header><div><div className="iv-eyebrow">{demoUnits[unit]} · AMOSTRA</div><h2 id="iv-detail-title">{asset ? 'Histórico do ativo' : 'Ativos do inventário'}</h2></div><button className="iv-icon-button" aria-label="Fechar detalhes" onClick={() => setDetail(null)}><Icon name="close" /></button></header>
      {asset ? <><button className="iv-text-button iv-back" onClick={() => setAsset(null)}>← Voltar aos ativos</button><div className="iv-asset-card"><span className="iv-badge">{asset.classe}</span><h3>{asset.numero}</h3><p>{asset.rodovia} · Km {asset.km.toLocaleString('pt-BR')} · Sentido {asset.sentido.toLocaleLowerCase('pt-BR')}</p><div><span>{asset.fotos} fotos cadastradas</span><span>{asset.apontamentos.length} apontamentos no histórico</span></div></div><div className="iv-drawer-notice"><Icon name="clock" size={18} /><span>Histórico completo do ativo, incluindo registros fora do período e do status selecionados no cruzamento.</span></div><h3 className="iv-drawer-subtitle">Apontamentos vinculados</h3>{asset.apontamentos.length ? <div className="iv-history">{[...asset.apontamentos].sort((a, b) => b.data.localeCompare(a.data)).map(r => <article key={r.numero}><span className={`iv-status-dot ${r.status === 'Executado' ? 'iv-done' : ''}`} /><div><strong>{r.numero}</strong><p>{r.classe}</p><small>{date(r.data)}</small></div><span className={`iv-badge ${r.status === 'Programado' ? 'iv-badge-amber' : ''}`}>{r.status}</span></article>)}</div> : <div className="iv-empty"><Icon name="layers" size={28} /><h3>Nenhum apontamento vinculado</h3><p>Não há registros vinculados a este ativo na amostra.</p></div>}<p className="iv-drawer-foot">Na integração final, cada registro terá o link fornecido pela API para abrir no Kartado.</p></> : <><p className="iv-drawer-context">{detail?.classe || 'Todas as classes'} · {detail?.rodovia || 'Todas as rodovias'}{detail?.mode === 'com' ? ' · Com apontamento no período' : detail?.mode === 'sem' ? ' · Sem apontamento no período' : ''}{detail?.status ? ` · ${detail.status}` : ''}</p>{partial && <div className="iv-drawer-notice">Coleta parcial: esta lista contém apenas os ativos recebidos.</div>}<label className="iv-search iv-detail-search"><Icon name="search" size={17} /><input aria-label="Buscar nos detalhes" placeholder="Buscar ativo, classe ou rodovia" value={detailSearch} onChange={e => setDetailSearch(e.target.value)} /></label><p className="iv-detail-count">{detailAssets.length} ativos na amostra</p><div className="iv-asset-list">{detailAssets.map(a => <button key={a.uuid} onClick={() => setAsset(a)}><span className="iv-asset-list-icon"><Icon name="layers" /></span><div><strong>{a.numero}</strong><span>{a.classe}</span><small>{a.rodovia} · Km {a.km.toLocaleString('pt-BR')} · {a.fotos} fotos</small></div><Icon name="chevron" size={18} /></button>)}</div>{!detailAssets.length && <div className="iv-empty"><h3>Nenhum ativo encontrado</h3><p>Ajuste os filtros ou a busca.</p></div>}</>}
    </div></dialog>
  </div>;
}
