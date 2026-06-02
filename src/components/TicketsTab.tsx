import { PanelShell } from '@/components/PanelShell';
import { TicketKpiCard } from '@/components/TicketKpiCard';
import { TicketsTable } from '@/components/TicketsTable';
import type { TicketRow } from '@/types/monitoring';
import { getTicketsSummary } from '@/utils/ticketsKpis';

interface TicketsTabProps {
  rows: TicketRow[];
  fileName?: string;
}

function RankingList({
  emptyText,
  items,
}: {
  emptyText: string;
  items: Array<{ label: string; count: number }>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-100 bg-white px-4 py-10 text-center text-sm text-surface-700">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="rounded-3xl border border-brand-100 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-surface-900">{item.label}</p>
            <span className="shrink-0 text-lg font-semibold text-brand-700">{item.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TicketsTab({ rows, fileName }: TicketsTabProps) {
  const summary = getTicketsSummary(rows);

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Chamados ProjectWise"
        description="Indicadores de atendimento, SLA, categorias e distribuição por organização."
        actions={
          fileName ? (
            <span className="max-w-[280px] truncate rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
              {fileName}
            </span>
          ) : null
        }
      >
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TicketKpiCard
            title="Total de chamados"
            value={String(summary.totalTickets)}
            helperText="Registros lidos na planilha"
          />
          <TicketKpiCard
            title="Atendidos"
            value={String(summary.attendedTickets)}
            helperText={`${summary.attendedPercentage} fechados ou resolvidos`}
            tone="good"
          />
          <TicketKpiCard
            title="Em aberto"
            value={String(summary.openTickets)}
            helperText={`${summary.newTickets} novos e ${summary.queuedTickets} na fila`}
            tone="attention"
          />
          <TicketKpiCard
            title="SLA violado"
            value={String(summary.violatedSla)}
            helperText={`${summary.violatedSlaPercentage} da base importada`}
            tone="warning"
          />
        </div>
      </PanelShell>

      <div className="grid gap-6 xl:grid-cols-3">
        <PanelShell
          title="Categorias"
          description="Maiores tipos de demanda registrados nos chamados."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhuma categoria informada na planilha."
            items={summary.topCategories}
          />
        </PanelShell>

        <PanelShell
          title="Organizações"
          description="Distribuição dos chamados por organização beneficiária."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhuma organização informada na planilha."
            items={summary.topOrganizations}
          />
        </PanelShell>

        <PanelShell
          title="Status"
          description="Visão rápida do andamento dos chamados importados."
          tone="soft"
        >
          <RankingList
            emptyText="Nenhum status informado na planilha."
            items={summary.statusBreakdown}
          />
        </PanelShell>
      </div>

      <PanelShell
        title="SLA"
        description="Leituras rápidas para acompanhar qualidade do atendimento."
        tone="soft"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-brand-100 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              Dentro do SLA
            </p>
            <p className="mt-3 text-3xl font-semibold text-surface-900">{summary.inSla}</p>
            <p className="mt-3 text-sm leading-6 text-surface-700">
              Chamados marcados como No SLA na planilha importada.
            </p>
          </div>
          <div className="rounded-3xl border border-brand-100 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              Fora do SLA
            </p>
            <p className="mt-3 text-3xl font-semibold text-surface-900">
              {summary.violatedSla}
            </p>
            <p className="mt-3 text-sm leading-6 text-surface-700">
              Casos com violação aparecem primeiro na lista detalhada.
            </p>
          </div>
        </div>
      </PanelShell>

      <TicketsTable rows={rows} />
    </div>
  );
}
