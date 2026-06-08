import { useEffect, useMemo, useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { TicketKpiCard } from '@/components/TicketKpiCard';
import { TicketsTable } from '@/components/TicketsTable';
import type { TicketRow } from '@/types/monitoring';
import { getTicketDateRange, getTicketServices, getTicketsSummary } from '@/utils/ticketsKpis';

interface TicketsTabProps {
  rows: TicketRow[];
  fileName?: string;
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
              <span className="shrink-0 text-base font-semibold text-brand-700">{item.count}</span>
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

function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; helper: string }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-brand-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            {item.label}
          </p>
          <p className="mt-3 text-3xl font-semibold text-surface-900">{item.value}</p>
          <p className="mt-3 text-sm leading-6 text-surface-700">{item.helper}</p>
        </div>
      ))}
    </div>
  );
}

function GaugeCard({
  helperText,
  maxLabel,
  title,
  value,
  valueLabel,
  variant = 'progress',
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
  const arcLength = 251;
  const segmentGap = 4;
  const segmentLength = (arcLength - segmentGap * 2) / 3;
  const dashLength = (normalizedValue / 100) * arcLength;
  const needleAngle = -90 + normalizedValue * 1.8;
  const strokeColor =
    tone === 'good' ? '#059669' : tone === 'warning' ? '#e11d48' : '#056b28';
  const segmentedArcs = [
    { color: '#dc2626', offset: 0 },
    { color: '#facc15', offset: -(segmentLength + segmentGap) },
    { color: '#16a34a', offset: -2 * (segmentLength + segmentGap) },
  ];

  return (
    <article className="flex h-full min-h-[220px] flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">{title}</p>

      <div className="relative mx-auto mt-4 h-[118px] w-full max-w-[220px]">
        <svg viewBox="0 0 200 120" className="h-full w-full" role="img" aria-label={title}>
          {variant === 'segmented' ? (
            segmentedArcs.map((arc) => (
              <path
                key={arc.color}
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={arc.color}
                strokeDasharray={`${segmentLength} ${arcLength}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                strokeWidth="18"
              />
            ))
          ) : (
            <>
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="#e8f2e4"
                strokeLinecap="round"
                strokeWidth="18"
              />
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={strokeColor}
                strokeDasharray={`${dashLength} ${arcLength}`}
                strokeLinecap="round"
                strokeWidth="18"
              />
            </>
          )}
          <line
            x1="100"
            x2="100"
            y1="100"
            y2="38"
            stroke="#183224"
            strokeLinecap="round"
            strokeWidth="5"
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformBox: 'fill-box',
              transformOrigin: '100px 100px',
            }}
          />
        </svg>

        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-3xl font-semibold leading-none text-surface-900">{valueLabel}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-medium text-surface-600">
        <span>0</span>
        <span>{maxLabel}</span>
      </div>
      <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">{helperText}</p>
    </article>
  );
}

function AverageResolutionCard({ value }: { value: string }) {
  return (
    <article className="flex h-full min-h-[220px] flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        Tempo medio de primeira resposta
      </p>
      <p className="mt-4 break-words text-[1.75rem] font-semibold leading-tight text-brand-700 md:text-[2.05rem]">
        {value}
      </p>
      <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">
        Tempo medio de primeira resposta do atendimento em horas uteis.
      </p>
    </article>
  );
}

export function TicketsTab({ rows, fileName }: TicketsTabProps) {
  const dateRange = useMemo(() => getTicketDateRange(rows), [rows]);
  const services = useMemo(() => getTicketServices(rows), [rows]);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [selectedService, setSelectedService] = useState('Todos os servicos');

  useEffect(() => {
    setPeriodStartDate(dateRange?.minDate ?? '');
    setPeriodEndDate(dateRange?.maxDate ?? '');
  }, [dateRange?.maxDate, dateRange?.minDate]);

  useEffect(() => {
    if (selectedService !== 'Todos os servicos' && !services.includes(selectedService)) {
      setSelectedService('Todos os servicos');
    }
  }, [selectedService, services]);

  const summary = useMemo(
    () =>
      getTicketsSummary(rows, {
        endDate: periodEndDate,
        selectedService,
        startDate: periodStartDate,
      }),
    [periodEndDate, periodStartDate, rows, selectedService],
  );

  function clearPeriodFilter() {
    setPeriodStartDate(dateRange?.minDate ?? '');
    setPeriodEndDate(dateRange?.maxDate ?? '');
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Chamados ProjectWise"
        description="Indicadores de atendimento, SLA, categorias e distribuicao por organizacao."
        actions={
          fileName ? (
            <span className="max-w-[280px] truncate rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
              {fileName}
            </span>
          ) : null
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-end">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
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
              className="h-11 rounded-2xl border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpar
            </button>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Servico selecionado
            <select
              value={selectedService}
              disabled={rows.length === 0}
              onChange={(event) => setSelectedService(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="Todos os servicos">Todos os servicos</option>
              {services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <TicketKpiCard
            title="Chamados abertos"
            value={String(summary.openedInPeriod)}
            helperText="Abertos dentro do periodo selecionado"
          />
          <TicketKpiCard
            title="Chamados encerrados"
            value={String(summary.closedInPeriod)}
            helperText="Fechados ou resolvidos dentro do periodo"
            tone="good"
          />
          <TicketKpiCard
            title="Chamados pendentes"
            value={String(summary.pendingTickets)}
            helperText="Status ainda nao finalizados"
            tone="attention"
          />
          <GaugeCard
            title="SLA"
            value={summary.slaComplianceValue}
            valueLabel={summary.slaCompliancePercentage}
            maxLabel="100%"
            helperText={`${summary.inSla} dentro do SLA em ${summary.slaApplicableTickets} encerrados aplicaveis`}
            variant="segmented"
            tone={summary.violatedSla > 0 ? 'warning' : 'good'}
          />
          <AverageResolutionCard value={summary.averageResolutionTime} />
        </div>
      </PanelShell>

      <PanelShell
        title="Servico selecionado"
        description="Chamados abertos por empresa e principais solicitantes no periodo."
        tone="soft"
      >
        <div className="mb-5 rounded-2xl border border-brand-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            {summary.selectedService}
          </p>
          <p className="mt-3 text-3xl font-semibold text-surface-900">
            {summary.selectedServiceOpenTickets}
          </p>
          <p className="mt-2 text-sm text-surface-700">
            Chamados abertos para o servico no periodo selecionado.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Abertos por empresa</h3>
            <RankingList
              emptyText="Nenhuma empresa encontrada para o servico selecionado."
              items={summary.selectedServiceOpenByCompany}
              limit={10}
            />
          </div>

          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Top 10 solicitantes</h3>
            <RankingList
              emptyText="Nenhum solicitante encontrado para o servico selecionado."
              items={summary.selectedServiceTopRequesters}
              limit={10}
            />
          </div>
        </div>
      </PanelShell>

      <PanelShell title="Backlog" description="Leitura rapida dos chamados pendentes." tone="soft">
        <MetricStrip
          items={[
            {
              label: 'Total em aberto',
              value: summary.openTickets,
              helper: `${summary.newTickets} novos e ${summary.queuedTickets} na fila`,
            },
            {
              label: 'Atendidos',
              value: summary.attendedTickets,
              helper: `${summary.attendedPercentage} da base importada`,
            },
            {
              label: 'SLA violado',
              value: summary.violatedSla,
              helper: `${summary.violatedSlaPercentage} dos abertos no periodo`,
            },
            {
              label: 'Total importado',
              value: summary.totalTickets,
              helper: 'Registros lidos na planilha',
            },
          ]}
        />

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Pendentes por idade</h3>
            <RankingList emptyText="Nenhum chamado pendente." items={summary.pendingAging} />
          </div>
          <div>
            <h3 className="mb-4 text-base font-semibold text-surface-900">Pendentes por prioridade</h3>
            <RankingList emptyText="Nenhuma prioridade pendente." items={summary.pendingByPriority} />
          </div>
        </div>
      </PanelShell>

      <div className="grid gap-6 xl:grid-cols-3">
        <PanelShell title="Servicos" description="Maiores tipos de demanda registrados." tone="soft">
          <RankingList
            emptyText="Nenhuma categoria informada na planilha."
            items={summary.topCategories}
            limit={10}
          />
        </PanelShell>

        <PanelShell
          title="Empresas"
          description="Distribuicao dos chamados por organizacao beneficiaria."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhuma organizacao informada na planilha."
            items={summary.topOrganizations}
            limit={10}
          />
        </PanelShell>

        <PanelShell
          title="Solicitantes"
          description="Top 10 pessoas solicitantes no periodo."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhum solicitante informado na planilha."
            items={summary.topRequesters}
            limit={10}
          />
        </PanelShell>
      </div>

      <TicketsTable rows={rows} />
    </div>
  );
}
