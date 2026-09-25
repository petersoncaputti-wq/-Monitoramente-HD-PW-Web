import type { EcoData, ecoAgenda } from '@/types/kartadoEco';
const pct = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => value.split('-').reverse().join('/');
const groups = [
  { label: 'Concluídos', color: '#047857' },
  { label: 'Parados', color: '#b45309' },
  { label: 'Aguardando', color: '#7c3aed' },
  { label: 'Não iniciados', color: '#64748b' },
  { label: 'Outros pendentes', color: '#0369a1' },
];
export function objectiveGroup(item: EcoData['Objetivos'][number]) {
  const status = item.Situacao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (item.Cumprimento >= 1) return 0;
  if (status === 'parado') return 1;
  if (status === 'aguardando') return 2;
  if (status === 'nao iniciado' || item.Cumprimento === 0) return 3;
  return 4;
}
export function EcoBar({ value, label }: { value: number; label: string }) {
  return <span role="img" aria-label={`${label}: ${pct(value)}`} className="mt-2 block h-3 overflow-hidden rounded-full bg-brand-50"><span className="block h-full rounded-full bg-brand-700" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, printColorAdjust: 'exact' }} /></span>;
}
export function EcoGroupCharts({ data, onSelect }: { data: EcoData; onSelect: (unit: string, filter: 'all' | 'pending' | 'stopped') => void }) {
  const max = Math.max(1, ...data.Unidades.map(unit => data.Objetivos.filter(item => item.Unidade === unit.Unidade).length));
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft"><h3 className="text-lg font-semibold text-surface-900">Cumprimento dos objetivos</h3><p className="mt-1 text-xs text-surface-600">Indicador informado na planilha. Escala de 0% a 100%.</p><div className="mt-5 space-y-5">{data.Unidades.map(unit => <button type="button" key={unit.Unidade} onClick={() => onSelect(unit.Unidade, 'all')} className="block w-full rounded-xl p-2 text-left hover:bg-brand-50"><span className="flex justify-between gap-3 text-sm"><span>{unit.Unidade}</span><strong>{pct(unit.ObjetivosCumpridos)}</strong></span><EcoBar value={unit.ObjetivosCumpridos} label={unit.Unidade} /></button>)}</div><p className="mt-4 text-xs text-surface-600">Mudanças na composição dos objetivos podem alterar a média sem avanço dos itens mantidos.</p></section>
    <section className="rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft"><h3 className="text-lg font-semibold text-surface-900">Objetivos por situação</h3><p className="mt-1 text-xs text-surface-600">Quantidade de objetivos. Escala comum: 0 a {max}.</p><div className="mt-5 space-y-5">{data.Unidades.map(unit => {
      const items = data.Objetivos.filter(item => item.Unidade === unit.Unidade);
      const counts = groups.map((_, index) => items.filter(item => objectiveGroup(item) === index).length);
      return <div key={unit.Unidade}><p className="mb-2 flex justify-between gap-2 text-sm"><span>{unit.Unidade}</span><strong>{items.length} objetivos</strong></p><div className="flex h-7 overflow-hidden rounded-lg bg-brand-50">{counts.map((count, index) => count > 0 && <button key={index} type="button" title={`${groups[index].label}: ${count}`} aria-label={`${unit.Unidade}: ${count} ${groups[index].label}`} onClick={() => onSelect(unit.Unidade, index === 0 ? 'all' : index === 1 || index === 2 ? 'stopped' : 'pending')} className="h-full text-xs font-bold text-white" style={{ width: `${count / max * 100}%`, backgroundColor: groups[index].color, printColorAdjust: 'exact' }}>{count}</button>)}</div><p className="mt-2 text-xs text-surface-600">{counts.map((count, index) => count ? `${groups[index].label}: ${count}` : '').filter(Boolean).join(' · ') || 'Sem objetivos'}</p></div>;
    })}</div><div className="mt-4 flex flex-wrap gap-3 text-xs">{groups.map(group => <span key={group.label} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: group.color, printColorAdjust: 'exact' }} />{group.label}</span>)}</div><details className="mt-3 text-xs text-surface-600"><summary className="cursor-pointer">Critérios de agrupamento</summary><p className="mt-2">Concluídos: cumprimento de 100%. Entre os demais, Parado, Aguardando e Não iniciado seguem a situação registrada; zero também indica não iniciado. Demais registros ficam em Outros pendentes, inclusive prazos vencidos. Cada objetivo pertence a um único grupo.</p></details></section>
  </div>;
}
export function EcoAttendanceChart({ meetings }: { meetings: EcoData['Reunioes'] }) {
  const rows = meetings.filter(item => item.Status === 'Realizada' && item.EntraNaMediaDePresenca === 'Sim');
  const rate = (item: typeof rows[number]) => item.Presentes !== null && item.Convocados !== null && item.Convocados > 0 ? item.Presentes / item.Convocados : null;
  const maximum = Math.max(1, ...rows.map(item => rate(item) ?? 0));
  return <div className="mt-5"><h5 className="font-semibold text-surface-900">Participação por reunião</h5><p className="mt-1 text-xs text-surface-600">Reuniões elegíveis para a média. Escala: 0% a {pct(maximum)}.</p><div className="mt-4 space-y-3">{rows.map((item, index) => { const value = rate(item); return <div key={`${item.Data}-${index}`}><div className="flex flex-wrap justify-between gap-2 text-xs"><span>{date(item.Data)}</span><span>{value === null ? 'Não apurado' : `${pct(value)} · ${item.Presentes}/${item.Convocados}`}</span></div>{value === null ? <div className="mt-1 h-2 rounded border border-dashed border-surface-300" aria-label={`${date(item.Data)}: não apurado`} /> : <div role="img" aria-label={`${date(item.Data)}: ${pct(value)}, ${item.Presentes} presentes de ${item.Convocados} convocados`} className="mt-1 h-2 overflow-hidden rounded bg-brand-50"><div className="h-full bg-brand-700" style={{ width: `${value / maximum * 100}%`, printColorAdjust: 'exact' }} /></div>}</div>; })}</div>{!rows.length && <p className="mt-3 text-sm text-surface-600">Nenhuma reunião elegível registrada.</p>}</div>;
}
export function EcoMilestoneTimeline({ events, showUnit = false }: { events: ReturnType<typeof ecoAgenda>; showUnit?: boolean }) {
  if (!events.length) return <p className="mt-3 text-sm text-surface-600">Nenhum marco futuro registrado.</p>;
  return <ol className="mt-4 space-y-5 border-l-2 border-brand-200 pl-5">{events.map((item, index) => <li key={`${item.Unidade}-${item.Data}-${index}`} className="relative"><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-700" /><p className="text-xs font-semibold text-brand-700"><time dateTime={item.Data}>{date(item.Data)}</time>{showUnit ? ` · ${item.Unidade}` : ''}</p><p className="mt-1 text-sm font-medium text-surface-900">{item.Evento}</p><p className="mt-1 text-xs text-surface-600">{item.Situacao} · {item.Evidencia}</p></li>)}</ol>;
}
