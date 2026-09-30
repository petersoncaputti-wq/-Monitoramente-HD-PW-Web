import { useMemo, useState } from 'react';
import type { AuditItem } from '@/services/kartadoAuditService';

type Bucket = { label: string; count: number };
const number = (value: number) => value.toLocaleString('pt-BR');
function group(items: AuditItem[], field: 'status' | 'natureza' | 'rodovia' | 'trecho'): Bucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = item[field]?.trim() || 'Não informado';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

function Distribution({ title, buckets, total, color }: { title: string; buckets: Bucket[]; total: number; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? buckets : buckets.slice(0, 8);
  const max = Math.max(1, ...buckets.map(item => item.count));
  return <section aria-label={title} className="min-w-0 rounded-2xl border border-brand-100 bg-white p-5">
    <h5 className="font-semibold text-surface-900">{title}</h5>
    <p className="mt-1 text-xs text-surface-600">Quantidade e participação nos registros filtrados.</p>
    <ul className="mt-5 space-y-4">
      {shown.map(item => <li key={item.label}>
        <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
          <span className="min-w-0 break-words text-surface-700">{item.label}</span>
          <span className="shrink-0 tabular-nums text-surface-900"><strong>{number(item.count)}</strong> <span className="text-xs text-surface-600">· {(item.count / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></span>
        </div>
        <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-surface-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${item.count / max * 100}%` }} /></div>
      </li>)}
    </ul>
    {buckets.length > 8 ? <button type="button" className="mt-4 rounded-lg px-2 py-2 text-sm font-semibold text-brand-700 focus-visible:outline focus-visible:outline-2" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Mostrar principais' : `Mostrar todas (${number(buckets.length)})`}</button> : null}
  </section>;
}

export function KartadoAuditCharts({ items, partial, sectionAvailable }: { items: AuditItem[]; partial: boolean; sectionAvailable: boolean }) {
  const data = useMemo(() => {
    const months = new Map<string, number>();
    let undated = 0;
    for (const item of items) {
      const date = item.dataCriacao;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) { undated++; continue; }
      const month = date.slice(0, 7);
      months.set(month, (months.get(month) || 0) + 1);
    }
    const keys = [...months.keys()].sort();
    const monthly: Bucket[] = [];
    if (keys.length) {
      const [firstYear, firstMonth] = keys[0].split('-').map(Number);
      const [lastYear, lastMonth] = keys[keys.length - 1].split('-').map(Number);
      for (let index = firstYear * 12 + firstMonth - 1; index <= lastYear * 12 + lastMonth - 1; index++) {
        const key = `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
        monthly.push({ label: key, count: months.get(key) || 0 });
      }
    }
    return { status: group(items, 'status'), nature: group(items, 'natureza'), road: group(items, 'rodovia'), section: group(items, 'trecho'), monthly, undated };
  }, [items]);
  const max = Math.max(1, ...data.monthly.map(item => item.count));
  return <section aria-label="Gráficos dos apontamentos" className="space-y-4">
    <div><h4 className="text-lg font-semibold text-surface-900">Análise dos apontamentos{partial ? ' · resultado parcial' : ''}</h4>
      <p className="mt-1 text-sm text-surface-600">{number(items.length)} registros após os filtros. {partial ? 'Os gráficos estão incompletos porque algumas páginas da consulta falharam.' : 'Os gráficos acompanham os filtros acima.'}</p></div>
    {!items.length ? <p className="rounded-2xl border border-brand-100 p-6 text-sm text-surface-600">Sem registros para exibir nos gráficos.</p> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Distribution title="Por status" buckets={data.status} total={items.length} color="bg-brand-600" />
        <Distribution title="Por natureza" buckets={data.nature} total={items.length} color="bg-teal-600" />
        <Distribution title="Por rodovia" buckets={data.road} total={items.length} color="bg-sky-600" />
        {sectionAvailable ? <Distribution title="Por trecho" buckets={data.section} total={items.length} color="bg-emerald-700" /> : null}
      </div>
      <section aria-label="Evolução mensal" className="min-w-0 rounded-2xl border border-brand-100 bg-white p-5">
        <h5 className="font-semibold text-surface-900">Evolução mensal</h5>
        <p className="mt-1 text-xs text-surface-600">Apontamentos por mês de criação, do primeiro ao último mês encontrado no recorte. Meses intermediários sem registros aparecem com zero.</p>
        {data.undated > 0 ? <p className="mt-2 text-xs text-amber-800">{number(data.undated)} registro(s) sem data de criação válida não entram neste gráfico.</p> : null}
        {!data.monthly.length ? <p className="mt-4 text-sm text-surface-600">Não há datas de criação válidas neste recorte.</p> : <>
          <div className="mt-5 overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Gráfico mensal; role horizontalmente para ver todos os meses">
            <div className="flex h-56 items-end gap-3" style={{ minWidth: `${data.monthly.length * 68}px` }}>
              {data.monthly.map(item => <div key={item.label} className="flex h-full min-w-14 flex-1 flex-col items-center justify-end">
                <div className="flex w-full flex-1 flex-col items-center justify-end"><span className="mb-1 text-xs font-semibold tabular-nums text-surface-700">{number(item.count)}</span><div aria-hidden="true" className="w-8 rounded-t-md bg-brand-600" style={{ height: `${item.count / max * 80}%`, minHeight: item.count ? 3 : 0 }} /></div>
                <span className="mt-2 whitespace-nowrap text-xs text-surface-600">{item.label.slice(5)}/{item.label.slice(0, 4)}</span>
              </div>)}
            </div>
          </div>
          <details className="mt-3 text-xs text-surface-600"><summary className="cursor-pointer py-2">Ver dados mensais em tabela</summary><div className="max-h-72 overflow-auto"><table className="mt-2 w-full text-left"><caption className="sr-only">Quantidade por mês de criação</caption><thead><tr><th scope="col" className="p-2">Mês</th><th scope="col" className="p-2">Quantidade</th></tr></thead><tbody>{data.monthly.map(item => <tr key={item.label} className="border-t border-brand-100"><th scope="row" className="p-2 font-normal">{item.label.slice(5)}/{item.label.slice(0, 4)}</th><td className="p-2">{number(item.count)}</td></tr>)}</tbody></table></div></details>
        </>}
      </section>
    </>}
  </section>;
}
