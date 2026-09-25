import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { EcoData as Data } from '@/types/kartadoEco';
type Snapshot = { id?: string; payload: Data; file_name: string; imported_at?: string };
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const button = 'rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50';
export function KartadoEcoImport({ children }: { children: (data: Data) => ReactNode }) {
  const { profile, getValidAccessToken } = useAuth();
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function request(options?: RequestInit, suffix = '') {
    const token = await getValidAccessToken();
    if (!token) throw new Error('Entre no painel para acessar as importações salvas.');
    const response = await fetch(`/api/kartado-eco${suffix}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível acessar a importação.');
    return result as Snapshot | null;
  }
  async function load() {
    setBusy(true); setError('');
    try { setSaved(await request()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar dados.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function prepare(selected: File | undefined) {
    setPreview(null); setFile(null); setError(''); setNotice('');
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.xlsx') || selected.size > 5 * 1024 * 1024) { setError('Selecione um Excel .xlsx de até 5 MB.'); return; }
    setBusy(true);
    try { setPreview(await request({ method: 'POST', headers: { 'Content-Type': mime }, body: selected }, `?preview=true&fileName=${encodeURIComponent(selected.name)}`)); setFile(selected); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha na validação.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!file || !preview) return;
    setBusy(true); setError('');
    try {
      const result = await request({ method: 'POST', headers: { 'Content-Type': mime }, body: file }, `?fileName=${encodeURIComponent(file.name)}`);
      setSaved(result); setPreview(null); setFile(null); setNotice('Importação salva. Todos os usuários verão esta base ao abrir ou recarregar o painel.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }
  const current = saved?.payload;
  const removed = preview && current ? current.Objetivos.filter(item => !preview.payload.Objetivos.some(next => next.Unidade === item.Unidade && next.Objetivo === item.Objetivo)) : [];
  return <>
    <section className="eco-no-print mt-6 rounded-2xl border border-brand-100 bg-white p-5" aria-label="Atualização da planilha Eco">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-surface-900">Atualização da planilha</h3><p className="mt-1 text-xs text-surface-600">{saved ? `${saved.file_name} · Importada em ${new Date(saved.imported_at!).toLocaleString('pt-BR')}` : busy ? 'Consultando dados...' : error ? 'Não foi possível confirmar a base salva.' : 'Nenhuma planilha importada.'}</p></div><div className="flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={() => void load()}>Recarregar dados</button>{profile?.role === 'admin' && <label className="flex flex-col gap-1 text-sm text-brand-700">Importar planilha (.xlsx)<input type="file" accept=".xlsx" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; void prepare(selected); }} /></label>}</div></div>
      {busy && <p className="mt-3 text-sm" role="status">Processando...</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error} Os dados exibidos não foram substituídos.</p>}
      {notice && <p className="mt-3 text-sm text-brand-700" role="status">{notice}</p>}
      {preview && <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4"><h4 className="font-semibold">Conferir importação: {preview.file_name}</h4><p className="mt-2 text-sm">Esta importação substituirá a base exibida para todos os usuários. O histórico fica preservado no banco.</p><ul className="my-3 space-y-1 text-sm">{(['Unidades','Objetivos','Reunioes','Marcos','Pessoas'] as const).map(name => <li key={name}>{name}: {current?.[name]?.length ?? 0} → {preview.payload[name]?.length ?? 0} registros</li>)}</ul><p className="text-xs">Na versão anterior, marcos estavam incluídos em Reunioes. Mudanças nas contagens podem refletir essa separação.</p>{removed.length > 0 && <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="font-semibold text-amber-900">Objetivos ausentes ou renomeados na nova base ({removed.length})</p><ul className="mt-2 text-sm">{removed.map(item => <li key={`${item.Unidade}-${item.Objetivo}`}>{item.Unidade}: {item.Objetivo}</li>)}</ul><p className="mt-2 text-xs">A retirada de objetivos pode mudar a média sem avanço nos objetivos restantes.</p></div>}<p className="text-sm">Referências: {preview.payload.Unidades.map(unit => `${unit.Unidade}: ${unit.DataReferencia.split('-').reverse().join('/')}`).join('; ')}.</p><p className="mt-2 text-xs">Confira as datas: uma planilha antiga também pode substituir a base atual.</p><div className="mt-4 flex gap-3"><button className={button} disabled={busy} onClick={() => void save()}>Confirmar importação</button><button className={button} disabled={busy} onClick={() => { setPreview(null); setFile(null); }}>Cancelar</button></div></div>}
    </section>
    {current ? children(current) : <section className="mt-5 rounded-2xl border border-brand-100 bg-white p-8 text-center"><h2 className="text-xl font-semibold text-surface-900">{busy ? 'Carregando acompanhamento Eco' : error ? 'Dados indisponíveis' : 'Aguardando a primeira importação'}</h2><p className="mt-3 text-sm text-surface-600">{busy ? 'Consultando as importações salvas no servidor.' : error ? 'Use Recarregar dados para tentar novamente.' : profile?.role === 'admin' ? 'Selecione a planilha Excel acima, confira a prévia e confirme a importação para preencher o painel.' : 'Um administrador precisa importar a planilha para disponibilizar o acompanhamento.'}</p></section>}
  </>;
}
