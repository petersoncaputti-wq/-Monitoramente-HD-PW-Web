import { useMemo, useState, type ReactNode } from 'react';
import { useUnitReportings } from '@/hooks/useUnitReportings';
import { auditToday } from '@/utils/kartadoAudit';
import {
  dailyTrend,
  executionTrend,
  monthlyTrend,
  quarterlyTrend,
  weeklyTrend,
  yearlyTrend,
} from '@/utils/kartadoTrends';
import { KartadoTrendBars } from './KartadoTrendBars';

const number = (value: number) => value.toLocaleString('pt-BR');
const button = 'rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50';
type Grouping = 'week' | 'quarter' | 'year';
const groupings: [Grouping, string][] = [
  ['week', 'Semana'],
  ['quarter', 'Trimestre'],
  ['year', 'Ano'],
];

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-2xl border border-brand-100 bg-white p-5">
      <h4 className="font-semibold text-surface-900">{title}</h4>
      <p className="mt-1 text-xs text-surface-600">{description}</p>
      {children}
    </section>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs text-surface-600">
      {label}
      <strong className="mt-0.5 block text-lg font-semibold tabular-nums text-surface-900">{value}</strong>
    </div>
  );
}

/** Séries temporais dos apontamentos da unidade, exibidas na Visão geral. */
export function KartadoReportingTrends({ company }: { company: string }) {
  const { items, total, busy, error, progress, partial, refresh } = useUnitReportings(company);
  const [grouping, setGrouping] = useState<Grouping>('week');
  const today = auditToday();
  const data = useMemo(() => {
    const execution = executionTrend(items, today);
    return {
      monthly: monthlyTrend(items),
      daily: dailyTrend(items, today),
      week: weeklyTrend(items, today),
      quarter: quarterlyTrend(items, today),
      year: yearlyTrend(items, today),
      execution,
      created: execution.reduce((sum, point) => sum + point.value, 0),
      executed: execution.reduce((sum, point) => sum + (point.value2 || 0), 0),
    };
  }, [items, today]);
  const dailyTotal = data.daily.reduce((sum, point) => sum + point.value, 0);
  const peak = data.daily.reduce((best, point) => (point.value > best.value ? point : best), data.daily[0]);
  const periods = data[grouping];
  return (
    <section aria-label="Evolução dos apontamentos" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-surface-900">
            Evolução dos apontamentos{partial ? ' · resultado parcial' : ''}
          </h3>
          <p className="mt-1 text-sm text-surface-600" aria-live="polite">
            {number(items.length)} de {number(total)} apontamentos recebidos.{' '}
            {busy ? progress : error ? '' : 'Histórico completo, todas as origens.'}
          </p>
        </div>
        <button type="button" className={button} disabled={busy} onClick={refresh}>
          Atualizar gráficos
        </button>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error} Os gráficos consideram somente os registros recebidos.
        </div>
      ) : null}
      {!items.length ? (
        <p className="rounded-2xl border border-brand-100 p-6 text-sm text-surface-600">
          {busy ? 'Carregando apontamentos para os gráficos...' : 'Sem apontamentos para exibir nos gráficos.'}
        </p>
      ) : (
        <>
          <Card
            title="Evolução mensal"
            description="Apontamentos por mês de criação, do primeiro ao último mês encontrado. Meses intermediários sem registros aparecem com zero."
          >
            {data.monthly.undated > 0 ? (
              <p className="mt-2 text-xs text-amber-800">
                {number(data.monthly.undated)} registro(s) sem data de criação válida não entram nestes gráficos.
              </p>
            ) : null}
            {data.monthly.points.length ? (
              <KartadoTrendBars points={data.monthly.points} ariaLabel="Apontamentos por mês de criação" column="Mês" />
            ) : (
              <p className="mt-4 text-sm text-surface-600">Não há datas de criação válidas.</p>
            )}
          </Card>
          <Card
            title="Apontamentos diários"
            description="Criados por dia nos últimos 30 dias. Dias sem registro aparecem com zero."
          >
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <Kpi label="Últimos 30 dias" value={number(dailyTotal)} />
              <Kpi
                label="Média por dia"
                value={(dailyTotal / data.daily.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
              />
              <Kpi label="Pico" value={peak.value ? `${number(peak.value)} · ${peak.label}` : '—'} />
              <Kpi label="Hoje" value={number(data.daily[data.daily.length - 1].value)} />
            </div>
            <KartadoTrendBars
              points={data.daily}
              ariaLabel="Apontamentos criados por dia"
              column="Dia"
              valueLabels={false}
              average={(value) => `média ${value}/dia`}
            />
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Apontamentos por período"
              description="Criados por semana, trimestre ou ano. O período marcado com * ainda está em andamento."
            >
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Agrupar por">
                {groupings.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={grouping === value}
                    onClick={() => setGrouping(value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${grouping === value ? 'border-brand-700 bg-brand-50 text-surface-900' : 'border-brand-200 text-surface-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <KartadoTrendBars
                points={periods}
                ariaLabel={`Apontamentos criados por ${groupings.find(([value]) => value === grouping)![1].toLowerCase()}`}
                column={groupings.find(([value]) => value === grouping)![1]}
              />
            </Card>
            <Card
              title="Apontamentos por execução"
              description="Criados x executados por mês, nos últimos 6 meses: criados pela data de criação, executados pela data de execução."
            >
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                <Kpi label="Criados" value={number(data.created)} />
                <Kpi label="Executados" value={number(data.executed)} />
                <Kpi
                  label="Taxa de execução"
                  value={
                    data.created
                      ? `${((data.executed / data.created) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                      : '—'
                  }
                />
              </div>
              <KartadoTrendBars
                points={data.execution}
                ariaLabel="Apontamentos criados e executados por mês"
                column="Mês"
                series="Criados"
                series2="Executados"
              />
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
