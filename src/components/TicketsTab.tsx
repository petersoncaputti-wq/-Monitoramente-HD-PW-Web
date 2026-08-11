import { useEffect, useMemo, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { TicketKpiCard } from '@/components/TicketKpiCard';
import type { TicketRow } from '@/types/monitoring';
import { getTicketDateRange, getTicketsSummary } from '@/utils/ticketsKpis';

interface TicketsTabProps {
  rows: TicketRow[];
}

function RankingList({
  emptyText,
  items,
  limit = 6,
}: {
  emptyText: string;
  items: Array<{ label: string; count: number }>;
  limit?: number;
}) {
  const visibleItems = items.slice(0, limit);
  const maxCount = Math.max(...visibleItems.map((item) => item.count), 0);
  const totalCount = items.reduce((total, item) => total + item.count, 0);

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-100 bg-white px-4 py-10 text-center text-sm text-surface-700">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => {
        const width = maxCount > 0 ? `${Math.max(8, (item.count / maxCount) * 100)}%` : '0%';

        return (
          <div key={item.label} className="rounded-2xl border border-brand-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-sm font-medium text-surface-900">{item.label}</p>
              <span className="shrink-0 text-base font-semibold text-brand-700">
                {item.count}
                <span className="ml-1 text-sm font-medium text-surface-600">
                  ·{' '}
                  {totalCount > 0
                    ? `${((item.count / totalCount) * 100).toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      })}%`
                    : '0,0%'}
                </span>
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-50">
              <div className="h-full rounded-full bg-brand-600" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DistributionBars({
  emptyText,
  items,
}: {
  emptyText: string;
  items: Array<{ label: string; count: number }>;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return <p className="py-10 text-center text-sm text-surface-700">{emptyText}</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-surface-900">{item.label}</span>
            <span className="shrink-0 font-semibold text-brand-700">
              {item.count} · {((item.count / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-brand-50">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${(item.count / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyVolumeChart({
  items,
}: {
  items: Array<{ label: string; opened: number; closed: number }>;
}) {
  const maxValue = Math.max(...items.flatMap((item) => [item.opened, item.closed]), 1);

  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-surface-700">Nenhum volume no período.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-4 text-xs font-semibold text-surface-700">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-brand-600" />Abertos</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Encerrados</span>
      </div>
      <div className="flex h-56 items-end gap-2 border-b border-brand-100 pb-2 sm:gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-44 w-full items-end justify-center gap-1 sm:gap-2">
              <div
                title={`${item.opened} abertos`}
                className="w-1/3 min-w-2 rounded-t-md bg-brand-600 transition hover:bg-brand-700"
                style={{ height: `${Math.max(item.opened > 0 ? 5 : 0, (item.opened / maxValue) * 100)}%` }}
              />
              <div
                title={`${item.closed} encerrados`}
                className="w-1/3 min-w-2 rounded-t-md bg-emerald-500 transition hover:bg-emerald-600"
                style={{ height: `${Math.max(item.closed > 0 ? 5 : 0, (item.closed / maxValue) * 100)}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] font-medium text-surface-600 sm:text-xs">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GaugeCard({
  helperText,
  title,
  value,
  valueLabel,
  tone = 'brand',
}: {
  helperText: string;
  maxLabel: string;
  title: string;
  value: number;
  valueLabel: string;
  variant?: 'progress' | 'segmented';
  tone?: 'brand' | 'good' | 'warning';
}) {
  const normalizedValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const strokeColor =
    tone === 'good' ? '#059669' : tone === 'warning' ? '#e11d48' : '#056b28';

  return (
    <article className="flex h-full min-h-[220px] flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">{title}</p>

      <div
        className="relative mx-auto mt-4 grid h-32 w-32 place-items-center rounded-full"
        style={{ background: `conic-gradient(${strokeColor} ${normalizedValue}%, #e8f2e4 0)` }}
        role="img"
        aria-label={`${title}: ${valueLabel}`}
      >
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
          <p className="text-3xl font-semibold leading-none text-surface-900">{valueLabel}</p>
        </div>
      </div>
      <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">{helperText}</p>
    </article>
  );
}

function AverageResolutionCard({ value }: { value: string }) {
  return (
    <article className="flex h-full min-h-[220px] flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        Tempo médio de solução
      </p>
      <p className="mt-4 break-words text-[1.75rem] font-semibold leading-tight text-brand-700 md:text-[2.05rem]">
        {value}
      </p>
      <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">
        Média em tempo útil entre abertura e encerramento. Acima de 24h, usa dias úteis de 8h.
      </p>
    </article>
  );
}

export function TicketsTab({ rows }: TicketsTabProps) {
  const dateRange = useMemo(() => getTicketDateRange(rows), [rows]);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');

  useEffect(() => {
    setPeriodStartDate(dateRange?.minDate ?? '');
    setPeriodEndDate(dateRange?.maxDate ?? '');
  }, [dateRange?.maxDate, dateRange?.minDate]);

  const summary = useMemo(
    () =>
      getTicketsSummary(rows, {
        endDate: periodEndDate,
        startDate: periodStartDate,
      }),
    [periodEndDate, periodStartDate, rows],
  );

  function clearPeriodFilter() {
    setPeriodStartDate(dateRange?.minDate ?? '');
    setPeriodEndDate(dateRange?.maxDate ?? '');
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Chamados"
        description="Indicadores de atendimento, SLA, categorias e distribuição por organização."
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_96px] sm:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data inicial
            <input
              type="date"
              value={periodStartDate}
              min={dateRange?.minDate}
              max={periodEndDate || dateRange?.maxDate}
              disabled={rows.length === 0}
              onChange={(event) => setPeriodStartDate(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data final
            <input
              type="date"
              value={periodEndDate}
              min={periodStartDate || dateRange?.minDate}
              max={dateRange?.maxDate}
              disabled={rows.length === 0}
              onChange={(event) => setPeriodEndDate(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <button
            type="button"
            onClick={clearPeriodFilter}
            disabled={rows.length === 0}
            className="h-11 rounded-xl border border-brand-100 bg-white px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpar
          </button>
        </div>

        <div className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <TicketKpiCard
            title="Chamados abertos"
            value={String(summary.openedInPeriod)}
            helperText="Abertos dentro do período selecionado"
          />
          <TicketKpiCard
            title="Chamados encerrados"
            value={String(summary.closedInPeriod)}
            helperText="Fechados ou resolvidos dentro do período"
            tone="good"
          />
          <TicketKpiCard
            title="Chamados pendentes"
            value={String(summary.pendingTickets)}
            helperText="Status ainda não finalizados"
            tone="attention"
          />
          <GaugeCard
            title="SLA"
            value={summary.slaComplianceValue}
            valueLabel={summary.slaCompliancePercentage}
            maxLabel="100%"
            helperText={`${summary.inSla} dentro do SLA em ${summary.slaApplicableTickets} chamados aplicáveis`}
            variant="segmented"
            tone={summary.violatedSla > 0 ? 'warning' : 'good'}
          />
          <AverageResolutionCard value={summary.averageResolutionTime} />
        </div>
      </PanelShell>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PanelShell
            title="Evolução dos chamados"
            description="Aberturas e encerramentos por mês no período selecionado."
          >
            <MonthlyVolumeChart items={summary.monthlyVolume} />
          </PanelShell>
        </div>

        <PanelShell
          title="Distribuição por status"
          description="Situação dos chamados registrados dentro do período."
          tone="soft"
        >
          <DistributionBars
            emptyText="Nenhum status encontrado no período."
            items={summary.statusBreakdown}
          />
        </PanelShell>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelShell
          title="Pendentes por idade"
          description="Tempo transcorrido desde a abertura dos chamados ainda pendentes."
          tone="soft"
        >
          <DistributionBars emptyText="Nenhum chamado pendente." items={summary.pendingAging} />
        </PanelShell>

        <PanelShell
          title="Tempo de resolução"
          description={`Distribuição dos encerrados. Mediana: ${summary.medianResolutionTime}.`}
          tone="soft"
        >
          <DistributionBars
            emptyText="Nenhum chamado encerrado no período."
            items={summary.resolutionTimeBuckets}
          />
        </PanelShell>

        <PanelShell
          title="Motivos"
          description="Maiores motivos entre os chamados abertos no período."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhum motivo informado no período."
            items={summary.topCategories}
            limit={6}
          />
        </PanelShell>
      </div>

      <PanelShell
        title="Detalhamento dos chamados"
        description="Chamados abertos por empresa e principais solicitantes para o filtro atual."
        tone="soft"
      >
        <div className="mb-5 rounded-2xl border border-brand-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            Período selecionado
          </p>
          <p className="mt-3 text-3xl font-semibold text-surface-900">
            {summary.selectedServiceOpenTickets}
          </p>
          <p className="mt-2 text-sm text-surface-700">
            Chamados abertos no período selecionado.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Abertos por empresa</h3>
            <RankingList
              emptyText="Nenhuma empresa encontrada para o serviço selecionado."
              items={summary.selectedServiceOpenByCompany}
              limit={10}
            />
          </div>

          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Top 10 solicitantes</h3>
            <RankingList
              emptyText="Nenhum solicitante encontrado para o serviço selecionado."
              items={summary.selectedServiceTopRequesters}
              limit={10}
            />
          </div>
        </div>
      </PanelShell>

    </div>
  );
}

