import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loadKartadoCompanies, type KartadoCompany } from '@/services/kartadoService';

type Ticket = { id: string; case_number: string; unit_id: string; unit_name: string; subject: string; description: string; status: string; priority: string; requester: string; responsible: string; resolution: string; opened_at: string; closed_at: string | null; updated_at: string };
const statuses = ['Novo', 'Em atendimento', 'Aguardando', 'Encerrado'];
const priorities = ['Baixa', 'Normal', 'Alta', 'Crítica'];
const inputClass = 'w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-surface-900';
const buttonClass = 'rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50';
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR');
function localDate(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function emptyTicket(): Ticket { return { id: '', case_number: '', unit_id: '', unit_name: '', subject: '', description: '', status: 'Novo', priority: 'Normal', requester: '', responsible: '', resolution: '', opened_at: localDate(new Date().toISOString()), closed_at: null, updated_at: '' }; }

export function KartadoTicketsPage({ unit }: { unit?: KartadoCompany }) {
  const { profile } = useAuth();
  const canManage = profile?.role === 'admin' && !unit;
  const [rows, setRows] = useState<Ticket[]>([]);
  const [companies, setCompanies] = useState<KartadoCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Ticket | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [unitId, setUnitId] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const unitKey = unit?.uuid || unit?.id || '';
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api/kartado-tickets${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar os chamados.');
    return data;
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    request<Ticket[]>(unitKey ? `?unit=${encodeURIComponent(unitKey)}` : '').then(data => { if (active) setRows(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    if (!unit) loadKartadoCompanies().then(data => { if (active) setCompanies(data); }).catch(() => { if (active) setMessage('Não foi possível carregar as unidades. Atualize a página para tentar novamente.'); });
    return () => { active = false; };
  }, [unitKey]);
  useEffect(() => setPage(1), [search, unitId, status, priority, from, to]);
  const filtered = rows.filter(row => (!unitId || row.unit_id === unitId) && (!status || row.status === status) && (!priority || row.priority === priority) && (!from || new Date(row.opened_at) >= new Date(`${from}T00:00:00`)) && (!to || new Date(row.opened_at) <= new Date(`${to}T23:59:59.999`)) && (!search || [row.case_number, row.subject, row.requester, row.responsible, row.description, row.unit_name].some(value => value.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20)), visiblePage = Math.min(page, totalPages);
  const unitOptions = new Map(rows.map(row => [row.unit_id, row.unit_name]));
  companies.forEach(company => unitOptions.set(company.uuid || company.id || '', company.name));
  const change = (key: keyof Ticket, value: string) => setDraft(current => current ? { ...current, [key]: value } : null);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await request<Ticket>(draft.id ? `/${draft.id}` : '', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...draft, opened_at: new Date(draft.opened_at).toISOString(), unit_name: unitOptions.get(draft.unit_id) || draft.unit_name }) });
      setRows(current => [saved, ...current.filter(row => row.id !== saved.id)].sort((a,b) => b.opened_at.localeCompare(a.opened_at)));
      setDraft(null); setDetail(null); setMessage('Chamado salvo com sucesso.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  return <section className="mt-5 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-surface-900">Chamados {unit ? `· ${unit.name}` : 'Kartado'}</h2><p className="mt-1 text-sm text-surface-600">{unit ? 'Acompanhe os chamados desta unidade.' : 'Registre e acompanhe as demandas de suporte por unidade.'}</p></div>{canManage && <button className="rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white" onClick={() => { setDraft(emptyTicket()); setDetail(null); setError(''); setMessage(''); }}>Novo chamado</button>}{unit && <Link className={buttonClass} to="/kartado/chamados">Cadastro central de chamados</Link>}</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-brand-50 p-4 text-sm text-brand-700">{message}</p>}
    {draft && <form onSubmit={save} className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5"><h3 className="font-semibold">{draft.id ? 'Editar chamado' : 'Novo chamado'}</h3><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Número do chamado<input required maxLength={100} className={inputClass} value={draft.case_number} onChange={e => change('case_number', e.target.value)} /></label>
      <label className="text-sm">Unidade<select required className={inputClass} value={draft.unit_id} onChange={e => change('unit_id', e.target.value)}><option value="">Selecione a unidade</option>{[...unitOptions].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-sm">Abertura<input required type="datetime-local" className={inputClass} value={draft.opened_at} onChange={e => change('opened_at',e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Assunto<input required maxLength={300} className={inputClass} value={draft.subject} onChange={e => change('subject',e.target.value)} /></label>
      <label className="text-sm">Status<select className={inputClass} value={draft.status} onChange={e => change('status',e.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-sm">Prioridade<select className={inputClass} value={draft.priority} onChange={e => change('priority',e.target.value)}>{priorities.map(value => <option key={value}>{value}</option>)}</select></label>
      {(['requester','responsible'] as const).map(key => <label key={key} className="text-sm">{key === 'requester' ? 'Solicitante' : 'Responsável'}<input maxLength={200} className={inputClass} value={draft[key]} onChange={e => change(key,e.target.value)} /></label>)}
      {(['description','resolution'] as const).map(key => <label key={key} className="text-sm sm:col-span-2 lg:col-span-3">{key === 'description' ? 'Descrição' : 'Solução / observações'}<textarea rows={3} maxLength={10000} className={inputClass} value={draft[key]} onChange={e => change(key,e.target.value)} /></label>)}
    </fieldset><p className="text-xs text-surface-600">Ao encerrar, a data de fechamento é registrada automaticamente. Reabrir remove o fechamento.</p><div className="flex gap-2"><button disabled={busy} className={buttonClass}>{busy ? 'Salvando…' : 'Salvar chamado'}</button><button type="button" disabled={busy} className={buttonClass} onClick={() => setDraft(null)}>Cancelar</button></div></form>}
    <div className="rounded-2xl border border-brand-100 bg-white p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">Busca<input className={inputClass} placeholder="Número, assunto ou pessoa" value={search} onChange={e => setSearch(e.target.value)} /></label>{!unit && <label className="text-sm">Unidade<select className={inputClass} value={unitId} onChange={e => setUnitId(e.target.value)}><option value="">Todas</option>{[...unitOptions].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>}<label className="text-sm">Status<select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Prioridade<select className={inputClass} value={priority} onChange={e => setPriority(e.target.value)}><option value="">Todas</option>{priorities.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Abertos de<input type="date" max={to || undefined} className={inputClass} value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-sm">Até<input type="date" min={from || undefined} className={inputClass} value={to} onChange={e => setTo(e.target.value)} /></label></div><button className={`${buttonClass} mt-3`} onClick={() => { setSearch(''); setUnitId(''); setStatus(''); setPriority(''); setFrom(''); setTo(''); }}>Limpar filtros</button></div>
    {!loading && !error && <div className="grid gap-3 sm:grid-cols-4">{[['Total',filtered.length],['Novos',filtered.filter(row => row.status === 'Novo').length],['Pendentes',filtered.filter(row => row.status !== 'Encerrado').length],['Encerrados',filtered.filter(row => row.status === 'Encerrado').length]].map(([label,value]) => <div key={label} className="rounded-2xl border border-brand-100 bg-white p-5"><p className="text-sm text-surface-600">{label}</p><p className="mt-2 text-3xl font-semibold text-brand-700">{value}</p></div>)}</div>}
    {detail && <article className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5"><div className="flex justify-between gap-3"><h3 className="font-semibold">{detail.case_number} · {detail.subject}</h3><button className={buttonClass} onClick={() => setDetail(null)}>Fechar detalhes</button></div><p className="text-sm">{detail.unit_name} · {detail.status} · {detail.priority}</p><p className="text-sm">Solicitante: {detail.requester || '—'} · Responsável: {detail.responsible || '—'}</p><p className="text-sm">Abertura: {dateLabel(detail.opened_at)} · Atualização: {dateLabel(detail.updated_at)}{detail.closed_at ? ` · Fechamento: ${dateLabel(detail.closed_at)}` : ''}</p><h4 className="text-sm font-semibold">Descrição</h4><p className="whitespace-pre-wrap text-sm">{detail.description || 'Sem descrição.'}</p><h4 className="text-sm font-semibold">Solução / observações</h4><p className="whitespace-pre-wrap text-sm">{detail.resolution || 'Sem solução registrada.'}</p></article>}
    <div className="rounded-2xl border border-brand-100 bg-white p-5"><h3 className="font-semibold">Lista de chamados</h3>{loading ? <p role="status" className="py-6 text-sm">Carregando chamados…</p> : error && !rows.length ? <p className="py-6 text-sm">A consulta não foi concluída. Atualize a página para tentar novamente.</p> : !filtered.length ? <p className="py-6 text-sm text-surface-600">{rows.length ? 'Nenhum chamado corresponde aos filtros.' : 'Nenhum chamado cadastrado para esta consulta.'}</p> : <><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Número / assunto','Unidade','Status','Prioridade','Responsável','Abertura','Ações'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{filtered.slice((visiblePage-1)*20, visiblePage*20).map(row => <tr key={row.id} className="border-t border-brand-100"><td className="p-3"><strong>{row.case_number}</strong><p>{row.subject}</p></td><td className="p-3">{row.unit_name}</td><td className="p-3">{row.status}</td><td className="p-3">{row.priority}</td><td className="p-3">{row.responsible || '—'}</td><td className="p-3">{dateLabel(row.opened_at)}</td><td className="p-3"><button className={buttonClass} onClick={() => setDetail(row)}>Detalhes</button>{canManage && <button className={`${buttonClass} mt-2`} onClick={() => { setDraft({ ...row, opened_at: localDate(row.opened_at) }); setDetail(null); setError(''); }}>Editar</button>}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span>{filtered.length} chamados · Página {visiblePage} de {totalPages}</span><button className={buttonClass} disabled={visiblePage <= 1} onClick={() => setPage(visiblePage-1)}>Anterior</button><button className={buttonClass} disabled={visiblePage >= totalPages} onClick={() => setPage(visiblePage+1)}>Próxima</button></div></>}</div>
  </section>;
}
