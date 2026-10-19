import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { PanelShell } from '@/components/PanelShell';
import { TicketKpiCard } from '@/components/TicketKpiCard';
import type { TicketRow } from '@/types/monitoring';
import { formatTicketDate, getTicketDateRange, getTicketsSummary, isClosedStatus } from '@/utils/ticketsKpis';
import {
  getDatePeriodPreset,
  getDefaultDatePeriod,
  type DatePeriodPreset,
} from '@/utils/datePeriod';

interface TicketsTabProps {
  rows: TicketRow[];
  detailedTotvs?: boolean;
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
  tone?: 'brand' | 'good' | 'attention' | 'warning';
}) {
  const normalizedValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const strokeColor =
    tone === 'good'
      ? '#059669'
      : tone === 'attention'
        ? '#eab308'
        : tone === 'warning'
          ? '#e11d48'
          : '#64748b';

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

function AverageResolutionCard({ value, elapsed = false }: { value: string; elapsed?: boolean }) {
  return (
    <article className="flex h-full min-h-[220px] flex-col rounded-[28px] border border-brand-100 bg-white p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        Tempo médio de solução
      </p>
      <p className="mt-4 break-words text-[1.75rem] font-semibold leading-tight text-brand-700 md:text-[2.05rem]">
        {value}
      </p>
      <p className="mt-auto pt-4 text-sm leading-6 text-surface-700">
        {elapsed ? 'Média em horas corridas entre criação e resolução, apenas com datas válidas.' : 'Média em tempo útil entre abertura e encerramento. Acima de 24h, usa dias úteis de 8h.'}
      </p>
    </article>
  );
}

export function TicketsTab({ rows, detailedTotvs = false }: TicketsTabProps) {
  const dateRange = useMemo(() => getTicketDateRange(rows), [rows]);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [situationFilter, setSituationFilter] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [allPending, setAllPending] = useState(false);
  const [page, setPage] = useState(1);
  const normalizeSearch = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const filterOptions = useMemo(() => {
    const values = (key: keyof TicketRow) => Array.from(new Set(rows.map(row => String(row[key] ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const statuses = values('Status').filter(value => {
      const situation = allPending ? 'pending' : situationFilter;
      return !situation || (situation === 'closed' ? isClosedStatus(value) : !isClosedStatus(value));
    });
    return { statuses, organizations: values('Organizaçãodosolicitante'), requesters: values('Solicitante') };
  }, [rows, situationFilter, allPending]);
  const detailedRows = useMemo(() => detailedTotvs ? rows.filter(row => {
    const opened = row.Abertoem.slice(0, 10);
    const inPeriod = (!periodStartDate || opened >= periodStartDate) && (!periodEndDate || opened <= periodEndDate);
    const closed = isClosedStatus(row.Status);
    const matchesStatus = !statusFilter || String(row.Status ?? '').trim() === statusFilter;
    const matchesSituation = !situationFilter || (situationFilter === 'pending' ? !closed : closed);
    const searchable = normalizeSearch([row['Caso n.º'], row.Resumo, row.Status, row.Organizaçãodosolicitante, row.Solicitante].join(' '));
    return (allPending ? !closed : inPeriod) && matchesStatus && matchesSituation
      && (!organizationFilter || String(row.Organizaçãodosolicitante ?? '').trim() === organizationFilter)
      && (!requesterFilter || String(row.Solicitante ?? '').trim() === requesterFilter)
      && normalizeSearch(search).split(/\s+/).filter(Boolean).every(term => searchable.includes(term));
  }).sort((a, b) => b.Abertoem.localeCompare(a.Abertoem)) : [], [rows, detailedTotvs, periodStartDate, periodEndDate, search, statusFilter, situationFilter, organizationFilter, requesterFilter, allPending]);
  useEffect(() => setPage(1), [periodStartDate, periodEndDate, search, rows, statusFilter, situationFilter, organizationFilter, requesterFilter, allPending]);
  const pages = Math.max(1, Math.ceil(detailedRows.length / 50));
  const visiblePage = Math.min(page, pages);

  useEffect(() => {
    const defaultPeriod = getDefaultDatePeriod(dateRange?.maxDate);
    setPeriodStartDate(defaultPeriod.startDate);
    setPeriodEndDate(defaultPeriod.endDate);
  }, [dateRange?.maxDate, dateRange?.minDate]);

  const summary = useMemo(
    () =>
      getTicketsSummary(rows, {
        endDate: periodEndDate,
        startDate: periodStartDate,
        elapsed: detailedTotvs,
      }),
    [periodEndDate, periodStartDate, rows, detailedTotvs],
  );
  const defaultTicketPeriod = useMemo(
    () => getDefaultDatePeriod(dateRange?.maxDate),
    [dateRange?.maxDate],
  );
  const isUsingLatestTicketMonth =
    defaultTicketPeriod.usedLatestAvailableMonth &&
    periodStartDate === defaultTicketPeriod.startDate &&
    periodEndDate === defaultTicketPeriod.endDate;
  const slaTone =
    summary.slaApplicableTickets === 0
      ? 'brand'
      : summary.slaComplianceValue >= 90
        ? 'good'
        : summary.slaComplianceValue >= 75
          ? 'attention'
          : 'warning';
  const slaLevel =
    summary.slaApplicableTickets === 0
      ? 'Sem chamados aplicáveis'
      : summary.slaComplianceValue >= 90
        ? 'Adequado'
        : summary.slaComplianceValue >= 75
          ? 'Atenção'
          : 'Crítico';

  function applyPeriodPreset(preset: DatePeriodPreset) {
    const period = getDatePeriodPreset(preset, {
      minDate: dateRange?.minDate,
      maxDate: dateRange?.maxDate,
    });
    setPeriodStartDate(period.startDate);
    setPeriodEndDate(period.endDate);
  }

  function exportFilteredTickets() {
    const sheet = XLSX.utils.json_to_sheet(detailedRows.map(row => ({
      Chamado: row['Caso n.º'], Descrição: row.Resumo || '', Status: row.Status,
      Criação: formatTicketDate(row.Abertoem), Resolução: row.Fechadoem ? formatTicketDate(row.Fechadoem) : '',
      Organização: row.Organizaçãodosolicitante || '', Solicitante: row.Solicitante || '',
    })));
    sheet['!cols'] = [18, 80, 20, 22, 22, 40, 35].map(wch => ({ wch }));
    sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1:G1' };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Chamados filtrados');
    XLSX.writeFile(workbook, 'totvs-chamados-filtrados.xlsx');
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Chamados"
        description={detailedTotvs ? 'Indicadores do recorte importado. Pendentes representam o status na exportação, entre os chamados criados no período.' : 'Indicadores de atendimento, SLA, categorias e distribuição por organização.'}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)] sm:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Data inicial
            <input
              type="date"
              value={periodStartDate}
              max={periodEndDate || undefined}
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
              min={periodStartDate || undefined}
              disabled={rows.length === 0}
              onChange={(event) => setPeriodEndDate(event.target.value)}
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['currentMonth', 'Mês atual'],
            ['last3Months', 'Últimos 3 meses'],
            ['last12Months', 'Últimos 12 meses'],
            ['all', 'Todo o período'],
          ].map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPeriodPreset(preset as DatePeriodPreset)}
              disabled={rows.length === 0}
              className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
        {isUsingLatestTicketMonth ? (
          <p className="mt-3 text-xs font-medium text-amber-700">
            Sem chamados no mês atual; exibindo o mês mais recente disponível.
          </p>
        ) : null}

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
            helperText={detailedTotvs ? 'Criados no período e ainda pendentes na exportação' : 'Status ainda não finalizados'}
            tone="attention"
          />
          {detailedTotvs ? <TicketKpiCard title="Mediana de solução" value={summary.medianResolutionTime} helperText="Metade dos chamados foi resolvida em até esse tempo. Horas corridas dos encerrados no período, com datas válidas." /> : <GaugeCard
            title="SLA"
            value={summary.slaComplianceValue}
            valueLabel={summary.slaCompliancePercentage}
            maxLabel="100%"
            helperText={`${slaLevel} · ${summary.inSla} dentro do SLA em ${summary.slaApplicableTickets} chamados aplicáveis`}
            variant="segmented"
            tone={slaTone}
          />}
          <AverageResolutionCard value={summary.averageResolutionTime} elapsed={detailedTotvs} />
        </div>
      </PanelShell>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PanelShell
            title="Evolução dos chamados"
            description="Aberturas e encerramentos por mês no período selecionado (até os últimos 12 meses)."
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
          title={detailedTotvs ? 'Organizações solicitantes' : 'Motivos'}
          description={detailedTotvs ? 'Organizações dos chamados abertos no período.' : 'Maiores motivos entre os chamados abertos no período.'}
          tone="soft"
        >
          <RankingList
            emptyText="Nenhum motivo informado no período."
            items={detailedTotvs ? summary.topRequesterOrganizations : summary.topCategories}
            limit={6}
          />
        </PanelShell>
      </div>

      {detailedTotvs && <PanelShell title="Lista de chamados" description={allPending ? 'Pendentes de toda a base importada, independentemente da data de criação. Os filtros abaixo afetam somente esta lista.' : 'Chamados criados no período selecionado. Os filtros abaixo afetam somente esta lista.'}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Buscar chamado<input className="h-11 rounded-2xl border border-brand-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" value={search} onChange={event => setSearch(event.target.value)} placeholder="Número, descrição ou solicitante" type="search" /></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Situação<select className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm" value={situationFilter} onChange={event => { setSituationFilter(event.target.value); setStatusFilter(''); }} disabled={allPending}><option value="">Todas as situações</option><option value="pending">Não finalizados</option><option value="closed">Finalizados</option></select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Status específico<select className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Todos os status</option>{filterOptions.statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Organização<select className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm" value={organizationFilter} onChange={event => setOrganizationFilter(event.target.value)}><option value="">Todas as organizações</option>{filterOptions.organizations.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">Solicitante<select className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm" value={requesterFilter} onChange={event => setRequesterFilter(event.target.value)}><option value="">Todos os solicitantes</option>{filterOptions.requesters.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-surface-700"><input type="checkbox" checked={allPending} onChange={event => { setAllPending(event.target.checked); setSituationFilter(event.target.checked ? 'pending' : ''); setStatusFilter(''); }} className="h-4 w-4 accent-brand-700" />Ver todos os pendentes, incluindo os criados antes do período</label>
          <button type="button" onClick={() => { setSearch(''); setStatusFilter(''); setSituationFilter(''); setOrganizationFilter(''); setRequesterFilter(''); setAllPending(false); }} className="rounded-xl border border-brand-100 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">Limpar filtros da lista</button>
        </div>
        <button type="button" onClick={exportFilteredTickets} disabled={!detailedRows.length} className="mt-4 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">Exportar filtrados em Excel ({detailedRows.length})</button>
        <p className="mt-3 text-sm text-surface-600" role="status">{detailedRows.length} chamado(s) encontrado(s). Pendentes: status diferente de Fechado e Resolvido na exportação.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead><tr className="border-b border-brand-100">{['Chamado', 'Descrição', 'Status', 'Criação', 'Resolução', 'Organização'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
          <tbody>{detailedRows.slice((visiblePage - 1) * 50, visiblePage * 50).map(row => <tr key={row['Caso n.º']} className="border-b border-brand-100">
            <th scope="row" className="p-3 font-medium">{row['Caso n.º']}</th><td className="max-w-sm whitespace-pre-wrap break-words p-3">{row.Resumo || 'Não informado'}</td><td className="p-3">{row.Status}</td><td className="whitespace-nowrap p-3">{formatTicketDate(row.Abertoem)}</td><td className="whitespace-nowrap p-3">{formatTicketDate(row.Fechadoem)}</td><td className="p-3">{row.Organizaçãodosolicitante || 'Não informada'}</td>
          </tr>)}</tbody>
        </table></div>
        {!detailedRows.length && <p className="py-5 text-sm text-surface-700">Nenhum chamado encontrado.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm"><span>{detailedRows.length} chamados · Página {visiblePage} de {pages}</span><button type="button" disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)} className="rounded-xl border border-brand-100 px-3 py-2 disabled:opacity-50">Anterior</button><button type="button" disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)} className="rounded-xl border border-brand-100 px-3 py-2 disabled:opacity-50">Próxima</button></div>
      </PanelShell>}

    </div>
  );
}

