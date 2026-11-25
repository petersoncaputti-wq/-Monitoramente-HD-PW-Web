import { useMemo, useState } from 'react';
import type { AuditItem } from '@/services/kartadoAuditService';
import { monthlyTrend } from '@/utils/kartadoTrends';
import { KartadoTrendBars } from './KartadoTrendBars';

type Bucket = { label: string; count: number };
const number = (value: number) => value.toLocaleString('pt-BR');
function group(items: AuditItem[], field: 'status' | 'natureza' | 'classe' | 'rodovia' | 'trecho'): Bucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = item[field]?.trim() || 'Não informado';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

function Distribution({
  title,
  buckets,
  total,
  color,
}: {
  title: string;
  buckets: Bucket[];
  total: number;
  color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? buckets : buckets.slice(0, 8);
  const max = Math.max(1, ...buckets.map((item) => item.count));
  return (
    <section aria-label={title} className="min-w-0 rounded-2xl border border-brand-100 bg-white p-5">
      <h5 className="font-semibold text-surface-900">{title}</h5>
      <p className="mt-1 text-xs text-surface-600">Quantidade e participação nos registros filtrados.</p>
      <ul className="mt-5 space-y-4">
        {shown.map((item) => (
          <li key={item.label}>
            <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-surface-700">{item.label}</span>
              <span className="shrink-0 tabular-nums text-surface-900">
                <strong>{number(item.count)}</strong>{' '}
                <span className="text-xs text-surface-600">
                  · {((item.count / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </span>
              </span>
            </div>
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-surface-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {buckets.length > 8 ? (
        <button
          type="button"
          className="mt-4 rounded-lg px-2 py-2 text-sm font-semibold text-brand-700 focus-visible:outline focus-visible:outline-2"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Mostrar principais' : `Mostrar todas (${number(buckets.length)})`}
        </button>
      ) : null}
    </section>
  );
}

export function KartadoAuditCharts({
  items,
  partial,
  sectionAvailable,
  sectionLabel = 'trecho',
  showMonthly = true,
}: {
  items: AuditItem[];
  partial: boolean;
  sectionAvailable: boolean;
  sectionLabel?: string;
  /** Na unidade, a evolução mensal dos apontamentos fica na Visão geral. */
  showMonthly?: boolean;
}) {
  const data = useMemo(() => {
    const { points: monthly, undated } = monthlyTrend(items);
    return {
      status: group(items, 'status'),
      nature: group(items, 'natureza'),
      classes: group(items, 'classe'),
      road: group(items, 'rodovia'),
      section: group(items, 'trecho'),
      monthly,
      undated,
    };
  }, [items]);
  return (
    <section aria-label="Gráficos dos apontamentos" className="space-y-4">
      <div>
        <h4 className="text-lg font-semibold text-surface-900">
          Análise dos apontamentos{partial ? ' · resultado parcial' : ''}
        </h4>
        <p className="mt-1 text-sm text-surface-600">
          {number(items.length)} registros após os filtros.{' '}
          {partial
            ? 'A consulta ainda está incompleta; os gráficos consideram somente os registros recebidos.'
            : 'Os gráficos acompanham os filtros acima.'}
        </p>
      </div>
      {!items.length ? (
        <p className="rounded-2xl border border-brand-100 p-6 text-sm text-surface-600">
          Sem registros para exibir nos gráficos.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {sectionAvailable ? (
              <section
                aria-label="Norte e Sul — visão geral"
                className="rounded-2xl border border-brand-100 bg-white p-5"
              >
                <h5 className="font-semibold text-surface-900">Norte e Sul — visão geral</h5>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
                  <div
                    role="img"
                    aria-label={data.section.map((bucket) => `${bucket.label}: ${number(bucket.count)}`).join('; ')}
                    className="h-44 w-44 shrink-0 rounded-full"
                    style={{
                      background: (() => {
                        let offset = 0;
                        return `conic-gradient(${data.section
                          .map((bucket) => {
                            const start = offset;
                            offset += (bucket.count / items.length) * 100;
                            const color =
                              bucket.label === 'Norte' ? '#3b82f6' : bucket.label === 'Sul' ? '#38bdf8' : '#94a3b8';
                            return `${color} ${start}% ${offset}%`;
                          })
                          .join(', ')})`;
                      })(),
                    }}
                  />
                  <ul className="space-y-3 text-sm">
                    {data.section.map((bucket) => (
                      <li key={bucket.label}>
                        <span
                          className={`mr-2 inline-block h-3 w-3 rounded-full ${bucket.label === 'Norte' ? 'bg-blue-500' : bucket.label === 'Sul' ? 'bg-sky-400' : 'bg-slate-400'}`}
                        />
                        {bucket.label}: <strong>{number(bucket.count)}</strong> ·{' '}
                        {((bucket.count / items.length) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}
            <Distribution title="Principais naturezas" buckets={data.nature} total={items.length} color="bg-blue-500" />
            <Distribution title="Por classe" buckets={data.classes} total={items.length} color="bg-sky-500" />
            <Distribution title="Por status" buckets={data.status} total={items.length} color="bg-brand-600" />
            <Distribution title="Por rodovia" buckets={data.road} total={items.length} color="bg-sky-600" />
            {sectionAvailable ? (
              <Distribution
                title={`Por ${sectionLabel}`}
                buckets={data.section}
                total={items.length}
                color="bg-emerald-700"
              />
            ) : null}
          </div>
          {showMonthly ? (
            <section aria-label="Evolução mensal" className="min-w-0 rounded-2xl border border-brand-100 bg-white p-5">
              <h5 className="font-semibold text-surface-900">Evolução mensal</h5>
              <p className="mt-1 text-xs text-surface-600">
                Apontamentos por mês de criação, do primeiro ao último mês encontrado no recorte. Meses intermediários
                sem registros aparecem com zero.
              </p>
              {data.undated > 0 ? (
                <p className="mt-2 text-xs text-amber-800">
                  {number(data.undated)} registro(s) sem data de criação válida não entram neste gráfico.
                </p>
              ) : null}
              {!data.monthly.length ? (
                <p className="mt-4 text-sm text-surface-600">Não há datas de criação válidas neste recorte.</p>
              ) : (
                <KartadoTrendBars points={data.monthly} ariaLabel="Quantidade por mês de criação" column="Mês" />
              )}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
