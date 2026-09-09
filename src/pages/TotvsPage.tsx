import { useEffect, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { TicketKpiCard } from '@/components/TicketKpiCard';
import { getTotvsCategories } from '@/utils/totvsKpis';
import { TotvsMonthlyEvolution } from '@/components/TotvsMonthlyEvolution';

interface TotvsData {
  reportPeriod: string; sourceUpdatedAt: string;
  lists: Record<string, { label: string; count: number }[]>;
}
interface Snapshot { id: string; report_period: string; source_updated_at: string; imported_at: string; categories?: ChartItem[] }
const format = (value?: number) => value === undefined ? 'Não disponível' : value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const periodLabel = (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
const sourceLabel = (value: string) => `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)} ${value.slice(11)}`;
const inputClass = 'h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-300';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/totvs${path}`, { ...init, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error || 'Não foi possível acessar os dados de TOTVs.');
  return body;
}
const chartColors = ['#28734c', '#438bcc', '#d4a21b', '#7c65b5', '#38999b'];
const shortCategory = (label: string) => label.replace(/^TI\s*-\s*TOTVS\s+TCOP\s*-\s*/i, '').replace(/\s*-\s*$/, '').replace(/\|/g, '/');
type ChartItem = { label: string; count: number };

function CategoryVolumeChart({ items }: { items: ChartItem[] }) {
  const maximum = Math.max(...items.map(row => row.count), 1);
  return <div className="overflow-x-auto pb-2">
    <div className="flex min-w-[320px] items-end gap-4" style={{ minWidth: Math.max(320, items.length * 110) }}>
      {items.map((row, index) => <div key={`${row.label}-${index}`} className="min-w-0 flex-1">
        <div className="flex h-60 items-end pt-8">
          <div className="relative mx-auto w-full max-w-24" style={{ height: `${row.count / maximum * 100}%` }}>
            <strong className="absolute bottom-full mb-2 w-full text-center text-lg text-surface-900">{format(row.count)}</strong>
            <div tabIndex={0} role="img" aria-label={`${row.label}: ${format(row.count)} aberturas`} title={`${row.label}: ${format(row.count)}`} className="h-full rounded-t-xl transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
          </div>
        </div>
        <p className="min-h-16 border-t border-brand-100 px-1 pt-3 text-center text-sm font-medium leading-5 text-surface-700">{shortCategory(row.label)}</p>
      </div>)}
    </div>
  </div>;
}

function CategoryShareChart({ items, total }: { items: ChartItem[]; total: number }) {
  let cumulative = 0;
  const stops = items.map((row, index) => {
    const start = cumulative;
    cumulative += total ? row.count / total * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${cumulative}%`;
  });
  return <div>
    <div role="img" aria-label={`Participação nas aberturas TOTVS: ${items.map(row => `${shortCategory(row.label)} ${total ? format(row.count / total * 100) + '%' : 'não disponível'}`).join('; ')}`} className="relative mx-auto mb-6 grid h-48 w-48 place-items-center rounded-full" style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e8f2e4' }}>
      <div className="grid h-32 w-32 content-center rounded-full bg-white text-center"><strong className="text-3xl text-surface-900">{format(total)}</strong><span className="mt-1 text-sm text-surface-700">identificadas</span></div>
    </div>
    <ul className="space-y-3">{items.map((row,index) => <li className="flex items-start gap-2 text-sm" key={`${row.label}-${index}`}>
      <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
      <span className="min-w-0 flex-1 break-words text-surface-700">{shortCategory(row.label)}</span>
      <strong className="shrink-0 text-surface-900">{total ? `${format(row.count / total * 100)}%` : 'Não disponível'}</strong>
    </li>)}</ul>
  </div>;
}

function LeadingCategoryGauge({ item, total }: { item: ChartItem; total: number }) {
  const share = total ? item.count / total * 100 : 0;
  return <article className="flex h-full flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
    <p className="kpi-card-title">Participação do principal motivo</p>
    <div role="img" aria-label={`${shortCategory(item.label)}: ${total ? format(share) + '%' : 'não disponível'} do recorte TOTVS`} className="mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full" style={{ background: `conic-gradient(#28734c ${share}%, #e8f2e4 0)` }}>
      <div className="grid h-20 w-20 place-items-center rounded-full bg-white"><strong className="text-xl text-surface-900">{total ? `${format(share)}%` : '—'}</strong></div>
    </div>
    <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">{shortCategory(item.label)} · {format(item.count)} de {format(total)} aberturas identificadas.</p>
  </article>;
}

export function TotvsPage({ canManage }: { canManage: boolean }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState('');
  const [data, setData] = useState<TotvsData | null>(null);
  const [reportPeriod, setReportPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await request<Snapshot[]>('');
        if (cancelled) return;
        setSnapshots(list);
        if (list[0]) {
          const result = await request<{ id: string; payload: TotvsData }>(`/${list[0].id}`);
          if (!cancelled) { setData(result.payload); setSnapshotId(result.id); }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar.'); }
      finally { if (!cancelled) setBusy(false); }
    }
    void load(); return () => { cancelled = true; };
  }, []);
  async function selectSnapshot(id: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request<{ id: string; payload: TotvsData }>(`/${id}`);
      setData(result.payload); setSnapshotId(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar.'); }
    finally { setBusy(false); }
  }
  async function importZip(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !reportPeriod) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith('.zip') || file.size > 10 * 1024 * 1024) throw new Error('Selecione um ZIP de até 10 MB.');
      const result = await request<{ id: string; payload: TotvsData }>(`?period=${encodeURIComponent(reportPeriod)}`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
      setData(result.payload); setSnapshotId(result.id);
      setMessage('Mês atualizado. O acumulado anterior deste mês foi substituído; somente categorias identificadas como TOTVS são salvas.');
      setSnapshots(await request<Snapshot[]>(''));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na importação.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 space-y-6" aria-busy={busy}>
    <PanelShell title="TOTVs · Chamados" description="Versão de teste · Chamados identificados como TOTVS nos relatórios exportados.">
      {import.meta.env.DEV && import.meta.env.VITE_TOTVS_LOCAL_PREVIEW === 'true' && <p className="mb-5 rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800">Prévia local: os arquivos importados ficam salvos apenas neste computador. A conexão com o banco do portal não está ativa neste teste.</p>}
      {canManage && <details open={!data} className="text-sm"><summary className="cursor-pointer font-semibold text-brand-700">Importar novo ZIP</summary><form onSubmit={event => void importZip(event)} className="mt-4 grid items-end gap-4 md:grid-cols-[180px_1fr_auto]">
        <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Período da exportação<input required type="month" className={inputClass} value={reportPeriod} onChange={event => setReportPeriod(event.target.value)} disabled={busy} /></label>
        <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-surface-700">Arquivo ZIP<input required type="file" accept=".zip" disabled={busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:p-3 file:text-brand-700" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={busy || !file || !reportPeriod} className="rounded-2xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Aguarde…' : 'Importar ZIP'}</button>
      </form><p className="mt-3 text-sm leading-6 text-surface-700">Informe o mês selecionado no painel de origem. A data da carga não define o período dos arquivos sem data.</p></details>}
      {!canManage && <p className="mt-3 text-sm text-surface-700">A importação de arquivos está disponível para administradores.</p>}
      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
      {busy && <p role="status" className="mt-4 text-sm text-surface-700">Carregando dados…</p>}
      {snapshots.length > 0 && <label className="mt-5 flex max-w-xl flex-col gap-2 text-sm font-medium text-surface-700">Mês de análise<select className={inputClass} value={snapshotId} disabled={busy} onChange={event => void selectSnapshot(event.target.value)}>{snapshots.map(row => <option key={row.id} value={row.id}>{periodLabel(row.report_period)} · atualizado em {sourceLabel(row.source_updated_at)}</option>)}</select></label>}
      {!data && !busy && <p className="mt-5 rounded-2xl border border-dashed border-brand-100 p-8 text-center text-surface-700">Nenhuma importação disponível. Importe o ZIP para visualizar os indicadores.</p>}
    </PanelShell>
    {data && <TotvsIndicators data={data} snapshots={snapshots} />}
  </div>;
}

export function TotvsIndicators({ data, snapshots = [] }: { data: TotvsData; snapshots?: Snapshot[] }) {
  const { items, identifiedOpened } = getTotvsCategories(data.lists.categories);
  return <>
    <PanelShell title="Chamados TOTVS" description={`Período exportado: ${periodLabel(data.reportPeriod)} · Carga: ${sourceLabel(data.sourceUpdatedAt)}.`}>
      {items.length ? <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TicketKpiCard title="Aberturas identificadas como TOTVS" value={format(identifiedOpened)} helperText="Soma das categorias TOTVS presentes no relatório exportado. A lista pode ser um ranking parcial." />
        <TicketKpiCard title="Categorias TOTVS" value={format(items.length)} helperText="Categorias identificadas neste recorte." />
        <TicketKpiCard title="Volume do principal motivo" value={format(items[0].count)} helperText={shortCategory(items[0].label)} />
        <LeadingCategoryGauge item={items[0]} total={identifiedOpened ?? 0} />
      </div> : <p role="status" className="rounded-2xl border border-dashed border-brand-100 p-6 text-sm text-surface-700">Nenhuma categoria identificada como TOTVS nesta importação. Isso não confirma ausência de chamados; confira o relatório de categorias exportado.</p>}
      <p className="mt-5 text-sm leading-6 text-surface-700">SLA, encerramentos, tempo médio, backlog e satisfação não estão disponíveis exclusivamente para TOTVS neste pacote.</p>
    </PanelShell>
    <TotvsMonthlyEvolution snapshots={snapshots} endPeriod={data.reportPeriod} />
    {items.length > 0 && <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><PanelShell title="Volume por motivo" description={`Aberturas identificadas nas categorias TOTVS · ${periodLabel(data.reportPeriod)}.`}><CategoryVolumeChart items={items} /></PanelShell></div>
        <PanelShell title="Distribuição por motivo" description="Participação no recorte TOTVS identificado." tone="soft"><CategoryShareChart items={items} total={identifiedOpened ?? 0} /></PanelShell>
      </div>
      <PanelShell title="Detalhamento das categorias" description="Valores da origem e participação nas aberturas identificadas como TOTVS.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-brand-100"><th className="p-3" scope="col">Categoria</th><th className="p-3 text-right" scope="col">Abertos</th><th className="p-3 text-right" scope="col">Participação no recorte TOTVS</th></tr></thead>
          <tbody>{items.map((row, index) => <tr key={`${row.label}-${index}`} className="border-b border-brand-100"><th scope="row" className="p-3 font-medium text-surface-900">{row.label}</th><td className="p-3 text-right">{format(row.count)}</td><td className="p-3 text-right">{identifiedOpened ? `${format(row.count / identifiedOpened * 100)}%` : 'Não disponível'}</td></tr>)}</tbody>
        </table>
      </div>
      </PanelShell>
    </>}
  </>;
}
