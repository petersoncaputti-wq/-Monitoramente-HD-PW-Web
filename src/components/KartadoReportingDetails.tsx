import { useEffect, useRef, useState } from 'react';

type Field = { key: string; label: string; value: string | null; type: string; manual: boolean };
type Location = { rodovia: string | null; km: number | null; kmFinal: number | null; sentido: string | null; faixa: string | null; lote: string | null; municipio: string | null; coordinates: number[] | null };
interface Detail {
  uuid: string; numero: string | null; unidade: string | null; equipe: string | null; classe: string | null; status: string | null;
  natureza: string | null; aprovacao: string | null; encontradoEm: string | null; criadoEm: string | null; executadoEm: string | null;
  prazo: string | null; atualizadoEm: string | null; localizacao: Location; campos: Field[]; avisos: string[]; totalArquivos: number;
  inventario: (Location & { uuid: string; numero: string | null; classe: string | null; encontradoEm: string | null }) | null;
}
interface Files {
  pagina: number; total: number; totalPaginas: number;
  arquivos: Array<{ uuid: string; descricao: string | null; url: string | null; imagem: boolean; tipo: string | null; data: string | null }>;
}
const button = 'rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40';
function date(value: string | null) {
  if (!value) return 'Não informado';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function Fields({ fields }: { fields: Array<[string, string | number | null | undefined]> }) {
  return <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-surface-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-surface-900">{value ?? 'Não informado'}</dd></div>)}</dl>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-brand-100 bg-white p-4 sm:p-5"><h4 className="mb-5 font-semibold text-surface-900">{title}</h4>{children}</section>;
}
async function request<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store', signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) throw new Error(data?.error || 'Não foi possível consultar a ficha.');
  return data as T;
}
export function KartadoReportingDetails({ company, uuid, onBack }: { company: string; uuid: string; onBack: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Detail | null>(null);
  const [files, setFiles] = useState<Files | null>(null);
  const [tab, setTab] = useState<'info' | 'files'>('info');
  const [error, setError] = useState('');
  const [filesError, setFilesError] = useState('');
  const [filesLoading, setFilesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const base = `/api/kartado-reporting-details/${encodeURIComponent(uuid)}`;
  const query = new URLSearchParams({ company }).toString();
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [uuid]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    void request<Detail>(`${base}?${query}`, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ficha indisponível.'); });
    return () => controller.abort();
  }, [base, query, revision]);
  useEffect(() => {
    if (tab !== 'files') return;
    const controller = new AbortController();
    setFilesLoading(true); setFilesError(''); setFiles(null);
    void request<Files>(`${base}/arquivos?${query}&page=${page}`, controller.signal).then(value => { if (!controller.signal.aborted) setFiles(value); })
      .catch(reason => { if (!controller.signal.aborted) setFilesError(reason instanceof Error ? reason.message : 'Arquivos indisponíveis.'); })
      .finally(() => { if (!controller.signal.aborted) setFilesLoading(false); });
    return () => controller.abort();
  }, [base, query, tab, page, revision]);
  return <div ref={panel} tabIndex={-1} className="space-y-5 py-5 outline-none" aria-label="Ficha do apontamento">
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={button} onClick={onBack}>← Voltar aos apontamentos</button><button type="button" className={button} onClick={() => setRevision(value => value + 1)}>Atualizar ficha</button></div>
    <div><p className="text-xs text-brand-700">Apontamento · somente leitura</p><h3 className="mt-2 break-words text-xl font-semibold">{data?.numero || 'Ficha do apontamento'}</h3>{data?.classe && <p className="mt-1 text-sm text-surface-600">{data.classe} · {data.status || 'Status não informado'}</p>}</div>
    <nav aria-label="Seções do apontamento" className="flex gap-2 border-b border-brand-100 pb-3">{([['info', 'Informações'], ['files', 'Arquivos e imagens']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`${button} ${tab === id ? 'bg-brand-50 ring-1 ring-brand-700' : ''}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!data && !error && <p role="status" className="rounded-xl bg-brand-50 p-5 text-sm">Consultando a ficha do apontamento…</p>}
    {data && tab === 'info' && <>
      {data.avisos.length > 0 && <div role="status" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">{data.avisos.map(warning => <p key={warning}>{warning}</p>)}</div>}
      <Section title="Identificação"><Fields fields={[
        ['Unidade', data.unidade], ['Equipe', data.equipe], ['Número', data.numero], ['Encontrado em', date(data.encontradoEm)],
        ['Prazo', date(data.prazo)], ['Executado em', date(data.executadoEm)], ['Natureza', data.natureza], ['Classe', data.classe],
        ['Status', data.status], ['Aprovação', data.aprovacao], ['Criado em', date(data.criadoEm)], ['Atualizado em', date(data.atualizadoEm)],
      ]} /></Section>
      <Section title="Inventário vinculado">{data.inventario ? <Fields fields={[
        ['Número do ativo', data.inventario.numero], ['Classe do ativo', data.inventario.classe], ['Rodovia', data.inventario.rodovia],
        ['Km inicial', data.inventario.km], ['Km final', data.inventario.kmFinal], ['Sentido', data.inventario.sentido],
        ['Faixa', data.inventario.faixa], ['Encontrado em', date(data.inventario.encontradoEm)],
      ]} /> : <p className="text-sm text-surface-600">Nenhum inventário disponível nesta ficha.</p>}</Section>
      <Section title="Localização do apontamento"><Fields fields={[
        ['Rodovia', data.localizacao.rodovia], ['Km inicial', data.localizacao.km], ['Km final', data.localizacao.kmFinal],
        ['Lote', data.localizacao.lote], ['Sentido', data.localizacao.sentido], ['Faixa', data.localizacao.faixa], ['Município', data.localizacao.municipio],
        ['Latitude', data.localizacao.coordinates?.[1]], ['Longitude', data.localizacao.coordinates?.[0]],
      ]} /></Section>
      <Section title="Dados do formulário">{data.campos.length ? <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{data.campos.map(field => <div key={field.key} className="min-w-0"><p className="text-xs text-surface-600">{field.label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">{/date|time/i.test(field.type) ? date(field.value) : field.value ?? 'Não informado'}</p>{field.manual && <p className="mt-1 text-[11px] text-surface-500">Especificado manualmente</p>}</div>)}</div> : <p className="text-sm text-surface-600">Nenhum campo preenchido foi disponibilizado.</p>}</Section>
    </>}
    {tab === 'files' && <>
      {filesError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{filesError}</p>}
      {filesLoading && <p role="status" className="rounded-xl bg-brand-50 p-5 text-sm">Consultando arquivos e imagens…</p>}
      {files && <><p className="text-xs text-surface-600">{files.total} arquivo(s) · página {files.pagina} de {files.totalPaginas}</p><div className="grid gap-4 sm:grid-cols-2">{files.arquivos.map((file, index) => <article key={file.uuid} className="overflow-hidden rounded-2xl border border-brand-100 bg-white p-3">{file.imagem && file.url && <img src={file.url} alt={file.descricao || `Imagem do apontamento ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" className="max-h-96 w-full rounded-xl object-contain" />}<p className="mt-3 whitespace-pre-wrap text-sm">{file.descricao || (file.imagem ? 'Imagem do apontamento' : 'Arquivo do apontamento')}</p><p className="mt-2 text-xs text-surface-600">{file.tipo || 'Sem categoria'} · {date(file.data)}</p>{file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">{file.imagem ? 'Ampliar imagem' : 'Abrir arquivo'}</a> : <p className="mt-3 text-xs text-surface-600">Arquivo sem endereço disponível.</p>}</article>)}</div>{!files.arquivos.length && <p className="py-6 text-sm text-surface-600">Nenhum arquivo recebido nesta página.</p>}<div className="flex justify-between gap-3"><button type="button" className={button} disabled={page <= 1 || filesLoading} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" className={button} disabled={page >= files.totalPaginas || filesLoading} onClick={() => setPage(value => value + 1)}>Próxima</button></div></>}
    </>}
  </div>;
}
