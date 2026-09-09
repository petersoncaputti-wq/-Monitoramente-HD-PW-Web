import { PanelShell } from '@/components/PanelShell';
import { getTotvsMonthlySeries, type TotvsMonthlySnapshot } from '@/utils/totvsKpis';

const label = (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

export function TotvsMonthlyEvolution({ snapshots, endPeriod }: { snapshots: TotvsMonthlySnapshot[]; endPeriod: string }) {
  const items = getTotvsMonthlySeries(snapshots, endPeriod);
  const max = Math.max(...items.map(row => row.opened ?? 0), 1);
  const available = items.filter(row => row.opened !== undefined).length;
  return <PanelShell title="Evolução mensal dos chamados TOTVS" description="Até 12 meses terminando no mês de análise. Cada coluna mostra o acumulado TOTVS identificado na última atualização daquele mês.">
    <p className="mb-5 flex items-center gap-2 text-sm font-medium text-brand-700"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-brand-600" />Aberturas identificadas como TOTVS</p>
    {items.length ? <div className="overflow-x-auto pb-3"><div className="flex items-end gap-4" style={{ minWidth: Math.max(300, items.length * 85) }}>
      {items.map(row => <div key={row.period} className="min-w-0 flex-1">
        <div className="flex h-60 items-end justify-center pt-8">
          {row.opened !== undefined ? <div className="relative w-2/3 max-w-20" style={{ height: `${row.opened / max * 100}%` }}>
            <strong className="absolute bottom-full mb-2 w-full text-center text-base text-surface-900">{row.opened.toLocaleString('pt-BR')}</strong>
            <div role="img" tabIndex={0} aria-label={`${label(row.period)}: ${row.opened} aberturas TOTVS identificadas`} title={`${label(row.period)}: ${row.opened}`} className="h-full rounded-t-lg bg-brand-600 transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2" />
          </div> : <span className="mb-4 text-center text-sm text-surface-600">{row.hasImport ? 'Não disponível' : 'Sem importação'}</span>}
        </div>
        <p className="border-t border-brand-100 pt-3 text-center text-sm font-medium text-surface-700">{label(row.period)}</p>
      </div>)}
    </div></div> : <p className="text-sm text-surface-700">Nenhum mês importado neste período.</p>}
    {available === 1 && <p className="mt-4 text-sm leading-6 text-surface-700">Há somente um mês com dados TOTVS identificados. A comparação aparecerá conforme outros meses forem importados.</p>}
    <p className="mt-4 text-sm leading-6 text-surface-700">Atualizações semanais substituem a coluna do mês. Meses sem dados não são tratados como zero; o histórico misto dos CSVs não entra neste gráfico.</p>
    {items.length > 0 && <details className="mt-5 text-sm"><summary className="cursor-pointer font-semibold text-brand-700">Consultar valores mensais</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr><th scope="col" className="p-3">Mês</th><th scope="col" className="p-3">Aberturas TOTVS identificadas</th></tr></thead><tbody>{items.map(row => <tr key={row.period} className="border-t border-brand-100"><th scope="row" className="p-3 font-medium">{label(row.period)}</th><td className="p-3">{row.opened?.toLocaleString('pt-BR') ?? (row.hasImport ? 'Não disponível' : 'Sem importação')}</td></tr>)}</tbody></table></div></details>}
  </PanelShell>;
}
