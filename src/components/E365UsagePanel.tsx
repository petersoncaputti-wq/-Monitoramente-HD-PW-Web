import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { ProjectWiseUserKpiCard } from '@/components/ProjectWiseUserKpiCard';
import { readMonitoringWorkbook } from '@/services/excelService';
import { mergeE365UsageRows, readE365UsageFile } from '@/services/e365UsageService';
import type { E365UsageRow, ProjectWiseWebUserRow } from '@/types/monitoring';
import {
  formatE365Currency,
  formatE365Date,
  formatE365Quarter,
  formatE365QuarterPeriod,
  getE365RegistrationComparison,
  getE365QuarterSummaries,
  type E365QuarterSummary,
} from '@/utils/e365UsageKpis';
import { getProjectWiseWebUsersSummary } from '@/utils/projectWiseUsersKpis';

interface E365UsagePanelProps {
  canManage: boolean;
  initialRows: E365UsageRow[];
  isLocalPreview: boolean;
  onImportE365Files: (files: File[]) => Promise<E365UsageRow[]>;
  portalRows: ProjectWiseWebUserRow[];
  onPortalRowsLoaded: (rows: ProjectWiseWebUserRow[]) => void;
}

interface E365EvolutionChartProps {
  currency: string;
  onSelectQuarter: (quarter: string) => void;
  selectedQuarter: string;
  summaries: E365QuarterSummary[];
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function E365EvolutionChart({
  currency,
  onSelectQuarter,
  selectedQuarter,
  summaries,
}: E365EvolutionChartProps) {
  const width = 1000;
  const height = 340;
  const padding = { bottom: 52, left: 82, right: 70, top: 28 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxSpend = Math.max(...summaries.map((item) => item.spend), 1);
  const maxUsers = Math.max(...summaries.map((item) => item.users), 1);
  const slotWidth = chartWidth / summaries.length;
  const barWidth = Math.min(62, slotWidth * 0.48);
  const points = summaries.map((item, index) => ({
    item,
    x: padding.left + slotWidth * index + slotWidth / 2,
    userY: padding.top + chartHeight - (item.users / maxUsers) * chartHeight,
  }));
  const linePoints = points.map((point) => `${point.x},${point.userY}`).join(' ');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-surface-700">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 bg-brand-600" /> Gasto do quarter</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-cyan-600" /> Usuários faturados</span>
        <span className="text-surface-500">Clique em um quarter para selecioná-lo</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Evolução trimestral do gasto e dos usuários faturados"
          className="min-w-[760px]"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartHeight - chartHeight * ratio;
            return (
              <g key={ratio}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#dce8df" strokeDasharray="4 5" />
                <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize="12" fill="#5f7464">{formatCompactNumber(maxSpend * ratio)}</text>
                <text x={width - padding.right + 12} y={y + 4} textAnchor="start" fontSize="12" fill="#5f7464">{Math.round(maxUsers * ratio)}</text>
              </g>
            );
          })}
          <text x="18" y={height / 2} transform={`rotate(-90 18 ${height / 2})`} textAnchor="middle" fontSize="12" fontWeight="600" fill="#365844">Gasto ({currency})</text>
          <text x={width - 14} y={height / 2} transform={`rotate(90 ${width - 14} ${height / 2})`} textAnchor="middle" fontSize="12" fontWeight="600" fill="#365844">Usuários</text>

          {points.map(({ item, x }) => {
            const barHeight = (item.spend / maxSpend) * chartHeight;
            const selected = item.quarter === selectedQuarter;
            return (
              <g key={item.quarter} onClick={() => onSelectQuarter(item.quarter)} className="cursor-pointer">
                {selected ? <rect x={x - slotWidth / 2 + 4} y={padding.top - 8} width={slotWidth - 8} height={chartHeight + 34} rx="4" fill="#edf7ee" /> : null}
                <rect x={x - barWidth / 2} y={padding.top + chartHeight - barHeight} width={barWidth} height={barHeight} rx="3" fill={selected ? '#056b28' : '#3f8458'}>
                  <title>{`${formatE365Quarter(item.quarter)} · ${formatE365QuarterPeriod(item.quarter)}\nGasto: ${formatE365Currency(item.spend, currency)}\nUsuários faturados: ${item.users}\nCusto médio: ${formatE365Currency(item.users ? item.spend / item.users : 0, currency)}`}</title>
                </rect>
                <text x={x} y={height - 22} textAnchor="middle" fontSize="13" fontWeight={selected ? '700' : '500'} fill={selected ? '#056b28' : '#365844'}>{formatE365Quarter(item.quarter)}</text>
              </g>
            );
          })}

          {summaries.length > 1 ? <polyline points={linePoints} fill="none" stroke="#0891b2" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.map(({ item, x, userY }) => (
            <circle key={`user-${item.quarter}`} cx={x} cy={userY} r={item.quarter === selectedQuarter ? 7 : 5} fill="#0891b2" stroke="white" strokeWidth="3" className="cursor-pointer" onClick={() => onSelectQuarter(item.quarter)}>
              <title>{`${formatE365Quarter(item.quarter)} · ${formatE365QuarterPeriod(item.quarter)}: ${item.users} usuários faturados`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function E365UsagePanel({
  canManage,
  initialRows,
  isLocalPreview,
  onImportE365Files,
  portalRows,
  onPortalRowsLoaded,
}: E365UsagePanelProps) {
  const portalInputId = useId();
  const e365InputId = useId();
  const [rows, setRows] = useState<E365UsageRow[]>(initialRows);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [portalFileName, setPortalFileName] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [billingListFilter, setBillingListFilter] = useState<'all' | 'portal' | 'outside'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingPortal, setIsImportingPortal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const portalSummary = useMemo(() => getProjectWiseWebUsersSummary(portalRows), [portalRows]);
  const portalActiveUsers = portalSummary.totalUsers - portalSummary.inactiveOver180Days;
  const summaries = useMemo(() => getE365QuarterSummaries(rows), [rows]);
  const effectiveQuarter = selectedQuarter || summaries[summaries.length - 1]?.quarter || '';
  const summary = summaries.find((item) => item.quarter === effectiveQuarter);
  const currency = rows.find((row) => String(row.UsageQuarter).trim() === effectiveQuarter)?.Currency || 'BRL';
  const comparison = useMemo(
    () => getE365RegistrationComparison(
      portalRows,
      rows.filter((row) => String(row.UsageQuarter).trim() === effectiveQuarter),
    ),
    [effectiveQuarter, portalRows, rows],
  );
  const comparedUsers = useMemo(() => {
    const source = billingListFilter === 'portal'
      ? comparison.portalBilledUsers
      : billingListFilter === 'outside'
        ? comparison.billedOutsidePortalUsers
        : [...comparison.portalBilledUsers, ...comparison.billedOutsidePortalUsers];
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return source
      .filter((user) => !term || user.email.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) => a.email.localeCompare(b.email, 'pt-BR'));
  }, [billingListFilter, comparison, searchTerm]);
  const comparisonTotal = comparison.portalUsers + comparison.billedOutsidePortal;
  const comparisonBarWidth = (value: number) => comparisonTotal ? (value / comparisonTotal) * 100 : 0;

  useEffect(() => {
    if (initialRows.length > 0) setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setBillingListFilter('all');
  }, [effectiveQuarter]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;

    try {
      setIsImporting(true);
      setErrorMessage('');
      if (isLocalPreview) {
        const importedGroups = await Promise.all(files.map(readE365UsageFile));
        setRows((current) => mergeE365UsageRows(current, importedGroups.flat()));
      } else {
        setRows(await onImportE365Files(files));
      }
      setFileNames((current) => [...new Set([...current, ...files.map((file) => file.name)])]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível ler o arquivo E365.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  }

  async function handlePortalFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImportingPortal(true);
      setErrorMessage('');
      const data = await readMonitoringWorkbook(file);

      if (data.kind !== 'projectWiseWebUsers') {
        throw new Error('Arquivo inválido. Selecione a exportação de usuários do Portal PW.');
      }

      onPortalRowsLoaded(data.rows as ProjectWiseWebUserRow[]);
      setPortalFileName(file.name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível ler o arquivo do Portal PW.');
    } finally {
      setIsImportingPortal(false);
      event.target.value = '';
    }
  }

  const portalCards = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ProjectWiseUserKpiCard
        title="Portal total"
        value={String(portalSummary.totalUsers)}
        helperText="Usuários cadastrados no Portal PW"
      />
      <ProjectWiseUserKpiCard
        title="Portal ativos"
        value={String(portalActiveUsers)}
        helperText={`${portalSummary.recentLoginPercentage} com login em 180 dias ou criado em 30 dias`}
        tone="good"
      />
      <ProjectWiseUserKpiCard
        title="Portal inativos"
        value={String(portalSummary.inactiveOver180Days)}
        helperText={`${portalSummary.inactiveOver180Percentage} sem login recente`}
        tone="warning"
      />
      <ProjectWiseUserKpiCard
        title="Criados em 30 dias"
        value={String(portalSummary.recentlyCreatedUsers)}
        helperText={`${portalSummary.recentlyCreatedUsersPercentage} da base Portal`}
        tone="good"
      />
    </div>
  );

  if (portalRows.length === 0 && isLocalPreview) {
    return (
      <PanelShell
        title="Base operacional"
        description="Comece pela base oficial de usuários exportada do Portal PW."
      >
        <div className="flex min-h-[220px] flex-col items-center justify-center border-y border-brand-100 px-5 py-10 text-center">
          <p className="text-lg font-semibold text-surface-900">Importe os usuários do Portal PW</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-surface-700">
            Essa base define o total de usuários cadastrados no sistema. O arquivo é processado somente nesta sessão.
          </p>
          <label htmlFor={portalInputId} className="mt-5 inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-600">
            {isImportingPortal ? 'Importando...' : 'Selecionar arquivo do Portal PW'}
          </label>
          <input id={portalInputId} type="file" accept=".csv,.xls,.xlsx" onChange={handlePortalFile} className="sr-only" />
          {errorMessage ? <p className="mt-4 text-sm font-medium text-rose-700">{errorMessage}</p> : null}
        </div>
      </PanelShell>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-6">
        <PanelShell title="Base operacional" description="Indicadores da base oficial importada do Portal PW.">
          {portalCards}
          <div className="mt-5 flex flex-col gap-3 border-t border-brand-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-surface-600">{portalFileName ? `Fonte local: ${portalFileName}` : 'Fonte carregada automaticamente pelo painel'}</p>
            {isLocalPreview ? <><label htmlFor={portalInputId} className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">Substituir arquivo do Portal</label><input id={portalInputId} type="file" accept=".csv,.xls,.xlsx" onChange={handlePortalFile} className="sr-only" /></> : null}
          </div>
        </PanelShell>

        <PanelShell title="Uso e faturamento E365" description="Adicione os dados trimestrais depois de validar a base cadastrada.">
          <div className="flex min-h-[190px] flex-col items-center justify-center border-y border-brand-100 px-5 py-9 text-center">
            <p className="text-lg font-semibold text-surface-900">Agora importe o E365 Usage Data</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-surface-700">O arquivo acrescenta usuários faturados, aplicações e gastos por quarter.</p>
            {canManage && isLocalPreview ? <><label htmlFor={e365InputId} className="mt-5 inline-flex h-11 cursor-pointer items-center justify-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-600">{isImporting ? 'Importando...' : 'Selecionar arquivos E365'}</label><input id={e365InputId} type="file" multiple accept=".csv,.xls,.xlsx" onChange={handleFiles} className="sr-only" /></> : <p className="mt-4 text-sm font-medium text-surface-600">Nenhum dado E365 foi publicado. A importação fica na área de fontes acima.</p>}
            {errorMessage ? <p className="mt-4 text-sm font-medium text-rose-700">{errorMessage}</p> : null}
          </div>
        </PanelShell>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelShell title="Base operacional" description="Indicadores da base oficial importada do Portal PW.">
        {portalCards}
        <div className="mt-5 flex flex-col gap-3 border-t border-brand-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-surface-600">{portalFileName ? `Fonte local: ${portalFileName}` : 'Fonte carregada automaticamente pelo painel'}</p>
          {isLocalPreview ? <><label htmlFor={portalInputId} className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">Substituir arquivo do Portal</label><input id={portalInputId} type="file" accept=".csv,.xls,.xlsx" onChange={handlePortalFile} className="sr-only" /></> : null}
        </div>
      </PanelShell>

      <PanelShell title="Evolução trimestral" description="Gasto líquido e usuários únicos em cada quarter importado.">
        <E365EvolutionChart
          currency={currency}
          onSelectQuarter={setSelectedQuarter}
          selectedQuarter={effectiveQuarter}
          summaries={summaries}
        />
      </PanelShell>

      <PanelShell title="Uso e faturamento E365" description="Usuários faturados e gastos do programa E365 por quarter.">
        <div className="flex flex-col gap-4 border-b border-brand-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
              Quarter
              <select value={effectiveQuarter} onChange={(event) => setSelectedQuarter(event.target.value)} className="h-11 min-w-[290px] rounded-lg border border-brand-100 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {summaries.map((item) => <option key={item.quarter} value={item.quarter}>{formatE365Quarter(item.quarter)} · {formatE365QuarterPeriod(item.quarter)}</option>)}
              </select>
            </label>
            {canManage && isLocalPreview ? <><label htmlFor={e365InputId} className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-100">
              {isImporting ? 'Importando...' : 'Adicionar arquivo'}
            </label>
            <input id={e365InputId} type="file" multiple accept=".csv,.xls,.xlsx" onChange={handleFiles} className="sr-only" />
            {isLocalPreview ? <button type="button" onClick={() => { setRows([]); setFileNames([]); setSelectedQuarter(''); setSearchTerm(''); }} className="h-11 px-3 text-sm font-semibold text-surface-700 transition hover:text-brand-700">Limpar dados</button> : null}</> : null}
          </div>
          <div className="text-left text-xs leading-5 text-surface-600 lg:text-right">
            <p>{fileNames.length} arquivo(s) local(is) · {rows.length} registros únicos</p>
            <p>Cobertura: {formatE365Date(summary.minUsageDate)} a {formatE365Date(summary.maxUsageDate)}</p>
          </div>
        </div>

        {errorMessage ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}

        <div className="mt-5 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProjectWiseUserKpiCard title="Usuários faturados" value={String(summary.users)} helperText={`${formatE365Quarter(summary.quarter)} · ${formatE365QuarterPeriod(summary.quarter)}`} />
          <ProjectWiseUserKpiCard title="Gasto do quarter" value={formatE365Currency(summary.spend, currency)} helperText="Valor líquido E365" />
          <ProjectWiseUserKpiCard title="Custo médio" value={formatE365Currency(summary.users ? summary.spend / summary.users : 0, currency)} helperText="Por usuário faturado" />
          <ProjectWiseUserKpiCard title="Aplicações" value={String(summary.applications.length)} helperText="Com cobrança no período" />
        </div>
      </PanelShell>

      <div className="flex flex-col gap-6">
        <PanelShell title="Gasto por aplicação" description={`Composição de ${formatE365Quarter(summary.quarter)}.`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-brand-100 text-xs uppercase text-brand-700"><tr><th className="pb-3 font-semibold">Aplicação</th><th className="pb-3 text-right font-semibold">Usuários</th><th className="pb-3 text-right font-semibold">Gasto</th><th className="pb-3 text-right font-semibold">Por usuário</th></tr></thead>
              <tbody className="divide-y divide-brand-50">
                {summary.applications.map((item) => <tr key={item.application}><td className="py-4 pr-4 font-medium text-surface-900">{item.application}</td><td className="py-4 text-right">{item.users}</td><td className="py-4 text-right">{formatE365Currency(item.spend, currency)}</td><td className="py-4 text-right">{formatE365Currency(item.costPerUser, currency)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </PanelShell>
      </div>

      <PanelShell title="Usuários faturados" description={`Relação nominal de ${formatE365Quarter(summary.quarter)}.`}>
        <div className="mb-6 border-b border-brand-100 pb-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-surface-900">Cadastrados x faturados</h3>
              <p className="mt-1 text-sm text-surface-600">
                Cobertura da base Portal PW em {formatE365Quarter(summary.quarter)}
              </p>
            </div>
            <p className="text-2xl font-semibold text-brand-700">
              {comparison.billingCoveragePercentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </p>
          </div>

          <div
            className="mt-4 flex h-7 w-full overflow-hidden rounded-md bg-surface-100"
            role="img"
            aria-label={`${comparison.portalBilled} cadastrados faturados, ${comparison.portalNotBilled} cadastrados não faturados e ${comparison.billedOutsidePortal} faturados fora da base`}
          >
            {comparisonTotal > 0 ? (
              <>
                <div
                  className="h-full bg-brand-600"
                  style={{ width: `${comparisonBarWidth(comparison.portalBilled)}%` }}
                  title={`${comparison.portalBilled} cadastrados faturados`}
                />
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${comparisonBarWidth(comparison.portalNotBilled)}%` }}
                  title={`${comparison.portalNotBilled} cadastrados não faturados`}
                />
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${comparisonBarWidth(comparison.billedOutsidePortal)}%` }}
                  title={`${comparison.billedOutsidePortal} faturados fora da base`}
                />
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-surface-700">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 bg-brand-600" /> Cadastrados faturados: {comparison.portalBilled}</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 bg-amber-400" /> Cadastrados não faturados: {comparison.portalNotBilled}</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 bg-rose-500" /> Faturados fora da base: {comparison.billedOutsidePortal}</span>
          </div>

          <p className="mt-3 text-xs text-surface-600">
            Total faturado: {comparison.quarterBilledUsers} = {comparison.portalBilled} cadastrados + {comparison.billedOutsidePortal} fora da base. Comparação por e-mail entre Portal PW e UniquePersona do E365.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-l-4 border-brand-600 bg-brand-50 px-4 py-3"><p className="text-xs font-semibold text-surface-700">Cadastrados</p><p className="mt-1 text-xl font-semibold text-surface-900">{comparison.portalUsers}</p><p className="mt-1 text-xs text-surface-600">Usuários existentes na base do Portal PW.</p></div>
            <button type="button" onClick={() => setBillingListFilter('portal')} aria-pressed={billingListFilter === 'portal'} className={`border-l-4 px-4 py-3 text-left transition ${billingListFilter === 'portal' ? 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-200' : 'border-emerald-500 bg-emerald-50 hover:bg-emerald-100'}`}><p className="text-xs font-semibold text-surface-700">Cadastrados faturados</p><p className="mt-1 text-xl font-semibold text-surface-900">{comparison.portalBilled}</p><p className="mt-1 text-xs text-surface-600">Encontrados no Portal PW e no E365. Clique para visualizar.</p></button>
            <div className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3"><p className="text-xs font-semibold text-surface-700">Sem faturamento</p><p className="mt-1 text-xl font-semibold text-surface-900">{comparison.portalNotBilled}</p><p className="mt-1 text-xs text-surface-600">Cadastrados sem cobrança no quarter.</p></div>
            <button type="button" onClick={() => setBillingListFilter('outside')} aria-pressed={billingListFilter === 'outside'} className={`border-l-4 px-4 py-3 text-left transition ${billingListFilter === 'outside' ? 'border-rose-600 bg-rose-100 ring-2 ring-rose-200' : 'border-rose-400 bg-rose-50 hover:bg-rose-100'}`}><p className="text-xs font-semibold text-surface-700">Faturados fora da base</p><p className="mt-1 text-xl font-semibold text-surface-900">{comparison.billedOutsidePortal}</p><p className="mt-1 text-xs text-surface-600">Presentes no E365 e ausentes no Portal PW. Clique para visualizar.</p></button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-surface-900">
            {billingListFilter === 'portal'
              ? 'Exibindo cadastrados faturados'
              : billingListFilter === 'outside'
                ? 'Exibindo faturados fora da base'
                : 'Exibindo todos os usuários faturados'}
          </p>
          <p className="text-xs text-surface-600">{formatE365Quarter(summary.quarter)}</p>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full max-w-2xl items-end gap-2">
            <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-surface-700">Pesquisar e-mail<input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="nome@empresa.com.br" className="h-11 rounded-lg border border-brand-100 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label>
            <button type="button" onClick={() => setSearchTerm('')} disabled={!searchTerm} className="h-11 rounded-lg border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">Limpar</button>
          </div>
          <div className="flex items-center gap-3">
            {billingListFilter !== 'all' ? <button type="button" onClick={() => setBillingListFilter('all')} className="text-xs font-semibold text-brand-700 hover:underline">Mostrar todos os faturados</button> : null}
            <p className="text-xs font-medium text-surface-600">{comparedUsers.length} usuário(s)</p>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto border-y border-brand-100">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 bg-brand-50 text-xs uppercase text-brand-700"><tr><th className="px-3 py-3 font-semibold">E-mail</th><th className="px-3 py-3 font-semibold">Situação</th><th className="px-3 py-3 font-semibold">Aplicações</th><th className="px-3 py-3 text-right font-semibold">Gasto</th><th className="px-3 py-3 font-semibold">Origem</th><th className="px-3 py-3 font-semibold">IMSID</th></tr></thead>
            <tbody className="divide-y divide-brand-50">
              {comparedUsers.map((user) => <tr key={`${user.status}-${user.email}`} className="hover:bg-brand-50/60"><td className="px-3 py-3 font-medium text-surface-900">{user.email}</td><td className="px-3 py-3 text-surface-700">{user.status}</td><td className="px-3 py-3 text-surface-700">{user.applications.join(', ') || '-'}</td><td className="whitespace-nowrap px-3 py-3 text-right">{formatE365Currency(user.spend, currency)}</td><td className="whitespace-nowrap px-3 py-3">{user.origin}</td><td className="px-3 py-3 font-mono text-xs text-surface-600">{user.imsIds.join(', ') || '-'}</td></tr>)}
              {comparedUsers.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-surface-600">Nenhum usuário encontrado nesta seleção.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </PanelShell>
    </div>
  );
}
