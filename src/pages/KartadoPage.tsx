import { useEffect, useMemo, useState } from 'react';
import {
  loadKartadoCompanies,
  loadKartadoConcession,
  loadKartadoHealth,
  loadKartadoReportings,
  searchKartadoUsers,
  type KartadoConcessionDashboard,
  type KartadoCompany,
  type KartadoUser,
} from '@/services/kartadoService';

type KartadoTab = 'overview' | 'users' | 'reportings' | 'alerts';
type KartadoArea = 'audit' | 'health';

const tabs: Array<{ id: KartadoTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'users', label: 'Usuários' },
  { id: 'reportings', label: 'Apontamentos' },
  { id: 'alerts', label: 'Alertas' },
];

const numberFormatter = new Intl.NumberFormat('pt-BR');
const PAGE_SIZE_OPTIONS = [20, 40, 80, 160, 200] as const;

function formatNumber(value: number) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[22px] border border-brand-100 bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-700">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-surface-900">
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
    </div>
  );
}

interface ChartDatum {
  label: string;
  value: number;
}

function BarChart({ data, emptyMessage = 'Sem dados disponíveis.' }: { data: ChartDatum[]; emptyMessage?: string }) {
  const visible = data.filter((item) => item.value >= 0).slice(0, 12);
  const maximum = Math.max(...visible.map((item) => item.value), 1);

  if (!visible.length) {
    return <p className="py-8 text-center text-sm text-surface-600">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {visible.map((item) => (
        <div key={item.label} title={`${item.label}: ${formatNumber(item.value)}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-surface-700">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-surface-900">{formatNumber(item.value)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-brand-50">
            <div
              className="h-full min-w-1 rounded-full bg-brand-700 transition-all duration-500"
              style={{ width: item.value === 0 ? '0%' : `${Math.max(2, (item.value / maximum) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, description, data }: { title: string; description: string; data: ChartDatum[] }) {
  return (
    <article className="rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
      <h3 className="text-base font-semibold text-surface-900">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-surface-600">{description}</p>
      <div className="mt-5"><BarChart data={data} /></div>
    </article>
  );
}

function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const first = total ? (safePage - 1) * pageSize + 1 : 0;
  const last = Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-brand-100 pt-4 text-sm text-surface-700 sm:flex-row sm:items-center sm:justify-between">
      <span>Exibindo {formatNumber(first)}–{formatNumber(last)} de {formatNumber(total)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-xs">Por página</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm">
            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} className="rounded-xl border border-brand-100 px-3 py-2 font-semibold text-brand-700 disabled:opacity-40">Anterior</button>
        <span className="min-w-20 text-center text-xs">{safePage} de {totalPages}</span>
        <button type="button" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} className="rounded-xl border border-brand-100 px-3 py-2 font-semibold text-brand-700 disabled:opacity-40">Próxima</button>
      </div>
    </div>
  );
}

function healthStatus(score: number) {
  return score >= 75
    ? { label: 'Saudável', color: 'text-emerald-700', background: 'bg-emerald-50', bar: 'bg-emerald-500' }
    : score >= 45
      ? { label: 'Atenção', color: 'text-amber-700', background: 'bg-amber-50', bar: 'bg-amber-500' }
      : { label: 'Crítico', color: 'text-red-700', background: 'bg-red-50', bar: 'bg-red-500' };
}

function HealthGauge({ score }: { score: number }) {
  const status = healthStatus(score);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-label={`Score ${score} de 100`}>
      <circle cx="42" cy="42" r={radius} fill="none" stroke="#e5efe9" strokeWidth="8" />
      <circle cx="42" cy="42" r={radius} fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" transform="rotate(-90 42 42)" className={status.color} />
      <text x="42" y="47" textAnchor="middle" className="fill-current text-base font-bold">{score}</text>
    </svg>
  );
}

function HealthPillar({ label, score, detail, available = true }: { label: string; score: number; detail: string; available?: boolean }) {
  const status = healthStatus(score);
  return (
    <div className={`rounded-2xl border border-brand-100 p-4 ${available ? 'bg-white' : 'bg-surface-50 opacity-70'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-surface-900">{label}</span>
        <span className={`font-semibold tabular-nums ${available ? status.color : 'text-surface-500'}`}>{available ? `${score}/100` : '—'}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-50"><div className={`h-full rounded-full ${available ? status.bar : 'bg-surface-300'}`} style={{ width: available ? `${score}%` : '0%' }} /></div>
      <p className="mt-2 text-xs leading-5 text-surface-600">{detail}</p>
    </div>
  );
}

function HealthUnitDetails({ unit }: { unit: KartadoConcessionDashboard }) {
  const summary = unit.summary;
  const score = Number(summary.saudeScore || 0);
  const status = healthStatus(score);
  const daysScore = Number(summary.diasUsoScore || 0);
  const days15Score = Number(summary.dias15Score || 0);
  const photosScore = Number(summary.pctFotosHistorico ?? summary.pctFotosNaAmostra ?? 0);
  const programmingScore = Number(summary.programacaoDimScore || 0);
  const programmingAvailable = summary.programacaoDimScore !== null && summary.programacaoDimScore !== undefined;
  return (
    <div className="rounded-b-2xl border border-t-0 border-brand-700 bg-brand-50/40 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <HealthGauge score={score} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Detalhamento da unidade</p>
          <h4 className="mt-1 text-xl font-semibold text-surface-900">{unit.company.name}</h4>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${status.background} ${status.color}`}>{status.label}</span>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <HealthPillar label="Dias de uso no mês" score={daysScore} detail={`${formatNumber(Number(summary.diasUsados || 0))} de ${formatNumber(Number(summary.diasUteisDecorridos || 0))} dias úteis com atividade.`} />
        <HealthPillar label="Atividade nos últimos 15 dias" score={days15Score} detail={`${formatNumber(Number(summary.dias15Usados || 0))} de ${formatNumber(Number(summary.diasUteisJanela || 0))} dias úteis com atividade.`} />
        <HealthPillar label="Apontamentos com foto" score={photosScore} detail={`${formatNumber(Number(summary.apontamentosFotoComFoto || 0))} apontamentos com foto; ${formatNumber(Number(unit.photos15d?.totalPhotos || 0))} fotos encontradas.`} available={summary.pctFotosHistorico !== null || summary.pctFotosNaAmostra !== null} />
        <HealthPillar label="Programações" score={programmingScore} detail={programmingAvailable ? `${formatNumber(Number(summary.programacaoConcluidas || 0))} concluídas, ${formatNumber(Number(summary.programacaoEmAndamento || 0))} em andamento e ${formatNumber(Number(summary.programacaoAtrasadas || 0))} atrasadas.` : 'Sem programações disponíveis para o período.'} available={programmingAvailable} />
      </div>
    </div>
  );
}

function KartadoHealthPanel({ units, loading, completed, total }: { units: KartadoConcessionDashboard[]; loading: boolean; completed: number; total: number }) {
  const [selectedUuid, setSelectedUuid] = useState('');
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'healthy' | 'attention' | 'critical'>('all');
  const [order, setOrder] = useState<'score' | 'volume' | 'name'>('score');
  const globalRanking = [...units].sort((a, b) => Number(b.summary.saudeScore || 0) - Number(a.summary.saudeScore || 0));
  const ranked = units.filter((unit) => {
    const score = Number(unit.summary.saudeScore || 0);
    return filter === 'all' || (filter === 'healthy' && score >= 75) || (filter === 'attention' && score >= 45 && score < 75) || (filter === 'critical' && score < 45);
  }).sort((a, b) => order === 'name' ? a.company.name.localeCompare(b.company.name, 'pt-BR') : order === 'volume' ? Number(b.summary.apontamentosTotal || 0) - Number(a.summary.apontamentosTotal || 0) : Number(b.summary.saudeScore || 0) - Number(a.summary.saudeScore || 0));
  const average = units.length ? Math.round(units.reduce((sum, unit) => sum + Number(unit.summary.saudeScore || 0), 0) / units.length) : 0;
  const healthy = units.filter((unit) => Number(unit.summary.saudeScore || 0) >= 75).length;
  const attention = units.filter((unit) => Number(unit.summary.saudeScore || 0) >= 45 && Number(unit.summary.saudeScore || 0) < 75).length;
  const critical = units.filter((unit) => Number(unit.summary.saudeScore || 0) < 45).length;

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-brand-100 bg-white shadow-soft">
        <button
          type="button"
          onClick={() => setExplanationOpen((current) => !current)}
          aria-expanded={explanationOpen}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div>
            <h3 className="font-semibold text-surface-900">Entenda o Score de Saúde</h3>
            <p className="mt-1 text-sm text-surface-600">
              Veja como o indicador representa o uso operacional do Kartado.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-brand-700">
            {explanationOpen ? 'Recolher' : 'Ver explicação'}
          </span>
        </button>
        {explanationOpen ? (
          <div className="border-t border-brand-100 px-5 py-5">
            <p className="max-w-4xl text-sm leading-6 text-surface-700">
              O Score de Saúde indica como cada unidade utiliza o Kartado no dia a dia. A nota
              considera frequência de registros, atividade recente, evidências fotográficas e
              execução das programações. Quanto mais próxima de 100, mais contínuo e completo é o
              uso da plataforma.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Dias de uso', 'Frequência de registros nos dias úteis do mês.'],
                ['Últimos 15 dias', 'Continuidade da atividade nos dias úteis mais recentes.'],
                ['Com foto', 'Presença de evidências fotográficas nos apontamentos.'],
                ['Programações', 'Execução das atividades planejadas, com impacto dos atrasos.'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                  <p className="text-sm font-semibold text-surface-900">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-surface-600">{description}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">75–100 · Saudável</span>
              <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-700">45–74 · Atenção</span>
              <span className="rounded-full bg-red-50 px-3 py-2 text-red-700">0–44 · Crítico</span>
            </div>
            <p className="mt-4 text-xs leading-5 text-surface-600">
              Pilares sem dados disponíveis são desconsiderados da média, em vez de receber nota
              zero. Quando a unidade não possui apontamentos, o score final é zero. O indicador
              avalia o uso operacional da plataforma; não representa disponibilidade técnica,
              desempenho contratual ou avaliação individual de pessoas.
            </p>
          </div>
        ) : null}
      </div>
      {loading ? <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">Calculando saúde das unidades: {completed} de {total} concluídas.</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Score médio" value={`${average}/100`} />
        <MetricCard label="Saudáveis" value={healthy} />
        <MetricCard label="Atenção" value={attention} />
        <MetricCard label="Críticas" value={critical} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Score por unidade" description="Visão gerencial comparativa da saúde operacional." data={globalRanking.map((unit) => ({ label: unit.company.name, value: Number(unit.summary.saudeScore || 0) }))} />
        <ChartCard title="Volume por unidade" description="Quantidade de apontamentos para comparação com o score." data={[...units].sort((a, b) => Number(b.summary.apontamentosTotal || 0) - Number(a.summary.apontamentosTotal || 0)).map((unit) => ({ label: unit.company.name, value: Number(unit.summary.apontamentosTotal || 0) }))} />
      </div>
      <div className="rounded-[28px] border border-brand-100 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-lg font-semibold text-surface-900">Ranking e diagnóstico</h3><p className="mt-1 text-sm text-surface-700">Compare as unidades e selecione uma para analisar os quatro pilares.</p></div><div className="flex flex-wrap gap-2"><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm"><option value="all">Todas as situações</option><option value="healthy">Saudáveis</option><option value="attention">Atenção</option><option value="critical">Críticas</option></select><select value={order} onChange={(event) => setOrder(event.target.value as typeof order)} className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm"><option value="score">Ordenar por score</option><option value="volume">Ordenar por volume</option><option value="name">Ordenar por nome</option></select></div></div>
        <div className="mt-5 space-y-3">
          {ranked.map((unit) => {
            const score = Number(unit.summary.saudeScore || 0);
            const status = healthStatus(score);
            const expanded = selectedUuid === unit.company.uuid;
            const globalRank = globalRanking.findIndex((item) => item.company.uuid === unit.company.uuid) + 1;
            return <div key={unit.company.uuid}><button type="button" aria-expanded={expanded} onClick={() => setSelectedUuid((current) => current === unit.company.uuid ? '' : unit.company.uuid)} className={`grid w-full gap-3 border p-4 text-left transition sm:grid-cols-[44px_1fr_100px] sm:items-center ${expanded ? 'rounded-t-2xl border-brand-700 bg-brand-50' : 'rounded-2xl border-brand-100 hover:bg-brand-50/50'}`}><span className="text-center text-lg font-semibold text-surface-500">#{globalRank}</span><div><span className="font-semibold text-surface-900">{unit.company.name}</span><p className="mt-1 text-xs text-surface-600">{formatNumber(Number(unit.summary.apontamentosTotal || 0))} apontamentos</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50"><div className={`h-full rounded-full ${status.bar}`} style={{ width: `${score}%` }} /></div></div><div className="text-right"><span className={`text-xl font-bold ${status.color}`}>{score}</span><span className={`block text-xs ${status.color}`}>{expanded ? 'Recolher detalhes' : status.label}</span></div></button>{expanded ? <HealthUnitDetails unit={unit} /> : null}</div>;
          })}
          {!ranked.length ? <p className="py-8 text-center text-sm text-surface-600">Nenhuma unidade corresponde ao filtro selecionado.</p> : null}
        </div>
      </div>
    </div>
  );
}

function riskLabel(user: KartadoUser) {

  return user.riskLevel === 'danger'
    ? 'Crítico'
    : user.riskLevel === 'warning'
      ? 'Atenção'
      : user.riskLevel === 'info'
        ? 'Informativo'
        : 'Regular';
}

export function KartadoPage({ area }: { area: KartadoArea }) {
  const [companies, setCompanies] = useState<KartadoCompany[]>([]);
  const [concessions, setConcessions] = useState<Record<string, KartadoConcessionDashboard>>({});
  const [failedCompanies, setFailedCompanies] = useState<Record<string, string>>({});
  const [detailedCompanies, setDetailedCompanies] = useState<Set<string>>(() => new Set());
  const [completedCount, setCompletedCount] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState('');
  const [tab, setTab] = useState<KartadoTab>('overview');
  const [search, setSearch] = useState('');
  const [remoteUsers, setRemoteUsers] = useState<KartadoUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [reportingsLoading, setReportingsLoading] = useState(false);
  const [reportingsError, setReportingsError] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(20);
  const [reportingsPage, setReportingsPage] = useState(1);
  const [reportingsPageSize, setReportingsPageSize] = useState(20);
  const [reportingsLoaded, setReportingsLoaded] = useState<Set<string>>(() => new Set());
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthCompleted, setHealthCompleted] = useState(0);
  const [healthConcessions, setHealthConcessions] = useState<Record<string, KartadoConcessionDashboard>>({});
  const [error, setError] = useState('');

  async function refresh(force = false) {
    setLoading(true);
    setError('');
    setSelectedUuid('');
    setConcessions({});
    setFailedCompanies({});
    setDetailedCompanies(new Set());
    setReportingsLoaded(new Set());
    setHealthConcessions({});
    setCompletedCount(0);
    try {
      const nextCompanies = await loadKartadoCompanies();
      setCompanies(nextCompanies);
      if (!nextCompanies.length) throw new Error('A conta Kartado não possui concessões ativas disponíveis.');

      await Promise.allSettled(
        nextCompanies.map(async (company) => {
          const uuid = company.uuid || company.id || '';
          try {
            const concession = await loadKartadoConcession(company, { summaryOnly: true, force });
            setConcessions((current) => ({ ...current, [uuid]: concession }));
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : 'Unidade indisponível.';
            setFailedCompanies((current) => ({ ...current, [uuid]: message }));
          } finally {
            setCompletedCount((current) => current + 1);
          }
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o Kartado.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo<KartadoConcessionDashboard | null>(
    () => concessions[selectedUuid] || null,
    [concessions, selectedUuid],
  );

  const totals = useMemo(
    () =>
      Object.values(concessions).reduce(
        (result, concession) => ({
          users: result.users + Number(concession.summary.usuariosAtivos || 0),
          reportings: result.reportings + Number(concession.summary.apontamentosTotal || 0),
          alerts: result.alerts + Number(concession.summary.alertasTotal || 0),
          critical: result.critical + Number(concession.summary.alertasCriticos || 0),
        }),
        { users: 0, reportings: 0, alerts: 0, critical: 0 },
      ),
    [concessions],
  );

  const loadedConcessions = useMemo(
    () =>
      companies
        .map((company) => concessions[company.uuid || company.id || ''])
        .filter((item): item is KartadoConcessionDashboard => Boolean(item)),
    [companies, concessions],
  );

  const usersByCompany = loadedConcessions.map((item) => ({
    label: item.company.name,
    value: Number(item.summary.usuariosAtivos || 0),
  }));
  const reportingsByCompany = loadedConcessions.map((item) => ({
    label: item.company.name,
    value: Number(item.summary.apontamentosTotal || 0),
  }));

  async function selectCompany(company: KartadoCompany) {
    const uuid = company.uuid || company.id || '';
    setSelectedUuid(uuid);
    setRemoteUsers(null);
    if (detailedCompanies.has(uuid)) return;
    setLoading(true);
    setError('');
    try {
      const concession = await loadKartadoConcession(company);
      setConcessions((current) => ({ ...current, [uuid]: concession }));
      setDetailedCompanies((current) => new Set(current).add(uuid));
      setFailedCompanies((current) => {
        const next = { ...current };
        delete next[uuid];
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a concessão.');
    } finally {
      setLoading(false);
    }
  }

  async function openHealthArea() {
    if (healthLoading || !companies.length) return;
    const pending = companies.filter(
      (company) => !healthConcessions[company.uuid || company.id || ''],
    );
    setHealthCompleted(companies.length - pending.length);
    if (!pending.length) return;

    setHealthLoading(true);
    await Promise.allSettled(
      pending.map(async (company) => {
        const uuid = company.uuid || company.id || '';
        try {
          const concession = await loadKartadoHealth(company);
          setHealthConcessions((current) => ({ ...current, [uuid]: concession }));
          setFailedCompanies((current) => {
            const next = { ...current };
            delete next[uuid];
            return next;
          });
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : 'Dados de saúde indisponíveis.';
          setFailedCompanies((current) => ({ ...current, [uuid]: message }));
        } finally {
          setHealthCompleted((current) => current + 1);
        }
      }),
    );
    setHealthLoading(false);
  }

  useEffect(() => {
    if (area === 'health' && companies.length) void openHealthArea();
  }, [area, companies.length]);

  const users = useMemo(() => {
    const source = remoteUsers ?? selected?.users.users ?? [];
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term || remoteUsers) return source;
    return source.filter((user) =>
      [user.fullName, user.username, user.email].some((value) =>
        String(value || '').toLocaleLowerCase('pt-BR').includes(term),
      ),
    );
  }, [remoteUsers, search, selected]);

  const alerts = selected?.alerts || [
    ...(selected?.users.alertas || []),
    ...(selected?.reportings.alerts || []),
  ];
  const paginatedUsers = users.slice((usersPage - 1) * usersPageSize, usersPage * usersPageSize);
  const reportingItems = selected?.reportings.items || [];
  const paginatedReportings = reportingItems.slice(
    (reportingsPage - 1) * reportingsPageSize,
    reportingsPage * reportingsPageSize,
  );

  useEffect(() => {
    setUsersPage(1);
  }, [search, selectedUuid, usersPageSize]);

  useEffect(() => {
    setReportingsPage(1);
  }, [selectedUuid, reportingsPageSize]);

  async function searchRemote() {
    if (!selected || !search.trim()) return;
    setSearching(true);
    setError('');
    try {
      setRemoteUsers(await searchKartadoUsers(selected.company.uuid, search.trim()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível pesquisar usuários.');
    } finally {
      setSearching(false);
    }
  }

  async function openTab(nextTab: KartadoTab) {
    setTab(nextTab);
    if (nextTab !== 'reportings' || !selected) return;
    if (reportingsLoaded.has(selected.company.uuid)) return;

    setReportingsLoading(true);
    setReportingsError('');
    try {
      const reportings = await loadKartadoReportings(selected.company.uuid);
      setConcessions((current) => ({
        ...current,
        [selected.company.uuid]: {
          ...selected,
          reportings,
          alerts: [...(selected.users.alertas || []), ...(reportings.alerts || [])],
        },
      }));
      setReportingsLoaded((current) => new Set(current).add(selected.company.uuid));
    } catch (reason) {
      setReportingsError(
        reason instanceof Error ? reason.message : 'Não foi possível carregar os apontamentos.',
      );
    } finally {
      setReportingsLoading(false);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-[28px] border border-brand-100 bg-white px-6 py-7 shadow-soft md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Sistema Kartado</p>
            <h2 className="mt-3 text-2xl font-semibold text-surface-900 md:text-3xl">Painel de auditoria</h2>
            <p className="mt-2 text-sm text-surface-700">Dados em tempo real da API Kartado.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={loading}
              className="rounded-2xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? 'Carregando...' : 'Atualizar dados'}
            </button>
          </div>
        </div>
        {companies.length ? (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-4 text-sm text-surface-700">
              <span>{completedCount} de {companies.length} unidades carregadas</span>
              {Object.keys(failedCompanies).length ? (
                <span className="font-semibold text-red-700">{Object.keys(failedCompanies).length} indisponível(is)</span>
              ) : null}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50">
              <div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${Math.round((completedCount / companies.length) * 100)}%` }} />
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      </div>

      {area === 'health' ? (
        <KartadoHealthPanel
          units={companies.map((company) => healthConcessions[company.uuid || company.id || '']).filter((unit): unit is KartadoConcessionDashboard => Boolean(unit))}
          loading={healthLoading}
          completed={healthCompleted}
          total={companies.length}
        />
      ) : null}


      {area === 'audit' && companies.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Usuários ativos" value={totals.users} />
          <MetricCard label="Apontamentos" value={totals.reportings} />
          <MetricCard label="Alertas" value={totals.alerts} />
          <MetricCard label="Críticos" value={totals.critical} />
        </div>
      ) : null}

      {area === 'audit' && loadedConcessions.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <ChartCard
            title="Usuários ativos por unidade"
            description="Comparativo das unidades já carregadas nesta atualização."
            data={[...usersByCompany].sort((a, b) => b.value - a.value)}
          />
          <ChartCard
            title="Apontamentos por unidade"
            description="Volume total informado pela API para cada unidade carregada."
            data={[...reportingsByCompany].sort((a, b) => b.value - a.value)}
          />
        </div>
      ) : null}

      {area === 'audit' && companies.length ? (
        <div className="rounded-[28px] border border-brand-100 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-surface-900">Unidades</h3>
            <p className="text-sm text-surface-700">Selecione uma unidade para consultar seus dados detalhados.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {companies.map((company) => {
              const uuid = company.uuid || company.id || '';
              const concession = concessions[uuid];
              const failure = failedCompanies[uuid];
              const isPending = !concession && !failure;
              return (
                <button
                  key={uuid}
                  type="button"
                  onClick={() => void selectCompany(company)}
                  disabled={isPending}
                  className={`rounded-2xl border p-4 text-left transition ${selectedUuid === uuid ? 'border-brand-700 bg-brand-50 ring-2 ring-brand-100' : 'border-brand-100 bg-white hover:border-brand-300 hover:bg-brand-50/50'} disabled:cursor-wait disabled:opacity-60`}
                >
                  <span className="block font-semibold text-surface-900">{company.name}</span>
                  <span className={`mt-2 block text-xs ${failure ? 'text-red-700' : 'text-surface-600'}`}>
                    {isPending ? 'Carregando...' : failure ? 'Indisponível — clique para tentar novamente' : `${formatNumber(Number(concession.summary.usuariosAtivos || 0))} usuários · ${formatNumber(Number(concession.summary.apontamentosTotal || 0))} apontamentos`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {area === 'audit' && selected ? (
        <div className="rounded-[28px] border border-brand-100 bg-white p-3 shadow-soft sm:p-5">
          {loading && !detailedCompanies.has(selectedUuid) ? (
            <p className="mb-4 rounded-2xl bg-brand-50 p-4 text-sm font-medium text-brand-700">
              Carregando dados completos de {selected.company.name}...
            </p>
          ) : null}
          <nav className="flex flex-wrap gap-2" aria-label="Navegação Kartado">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => void openTab(item.id)} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${tab === item.id ? 'bg-brand-700 text-white' : 'text-surface-700 hover:bg-brand-50'}`}>
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'overview' ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Concessão" value={selected.company.name} />
                <MetricCard label="Usuários" value={Number(selected.summary.usuariosAtivos || 0)} />
                <MetricCard label="Apontamentos" value={Number(selected.summary.apontamentosTotal || 0)} />
                <MetricCard label="Saúde" value={`${Number(selected.summary.saudeScore || 0)}/100`} />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <ChartCard
                  title="Perfil dos usuários"
                  description="Distribuição dos usuários retornados para a unidade."
                  data={[
                    { label: 'Internos', value: Number(selected.users.counts.internos || 0) },
                    { label: 'Terceiros', value: Number(selected.users.counts.terceiros || 0) },
                    { label: 'Supervisores', value: Number(selected.users.counts.supervisores || 0) },
                    { label: 'Sem acesso há 60 dias', value: Number(selected.users.counts.semAcesso60d || 0) },
                  ]}
                />
                <ChartCard
                  title="Apontamentos por status"
                  description="Distribuição baseada nos registros retornados pela API."
                  data={(selected.reportings.byStatus || []).map((item) => ({ label: item.name, value: item.count }))}
                />
                <ChartCard
                  title="Apontamentos por tipo"
                  description="Principais tipos de ocorrência encontrados na unidade."
                  data={(selected.reportings.byType || []).map((item) => ({ label: item.name, value: item.count }))}
                />
                <ChartCard
                  title="Apontamentos por rodovia"
                  description="Rodovias com maior volume na amostra retornada."
                  data={(selected.reportings.byRoad || []).map((item) => ({ label: item.name, value: item.count }))}
                />
              </div>
            </div>
          ) : null}

          {tab === 'users' ? (
            <div className="mt-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input value={search} onChange={(event) => { setSearch(event.target.value); setRemoteUsers(null); }} placeholder="Buscar por nome, usuário ou e-mail" className="min-w-0 flex-1 rounded-2xl border border-brand-100 px-4 py-3 text-sm" />
                <button type="button" onClick={() => void searchRemote()} disabled={!search.trim() || searching} className="rounded-2xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700 disabled:opacity-50">{searching ? 'Buscando...' : 'Buscar na API'}</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-brand-100 text-xs uppercase tracking-wide text-surface-600"><tr><th className="p-3">Risco</th><th className="p-3">Nome</th><th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Expiração</th></tr></thead>
                  <tbody>{paginatedUsers.map((user, index) => <tr key={user.id || index} className="border-b border-brand-50"><td className="p-3">{riskLabel(user)}</td><td className="p-3 font-medium text-surface-900">{user.fullName || '—'}</td><td className="p-3">{user.username || '—'}</td><td className="p-3">{user.email || '—'}</td><td className="p-3">{user.expirationDate || '—'}</td></tr>)}</tbody>
                </table>
              </div>
              <Pagination page={usersPage} pageSize={usersPageSize} total={users.length} onPageChange={setUsersPage} onPageSizeChange={setUsersPageSize} />
            </div>
          ) : null}

          {tab === 'reportings' ? (
            <div className="mt-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-surface-700">
                <span>
                  Exibindo {formatNumber(selected.reportings.items?.length || 0)} de{' '}
                  {formatNumber(Number(selected.summary.apontamentosTotal || 0))} apontamentos.
                </span>
                <button type="button" onClick={() => void loadKartadoReportings(selected.company.uuid).then((reportings) => setConcessions((current) => ({ ...current, [selected.company.uuid]: { ...selected, reportings, alerts: [...(selected.users.alertas || []), ...(reportings.alerts || [])] } }))).catch((reason: unknown) => setReportingsError(reason instanceof Error ? reason.message : 'Falha ao atualizar apontamentos.'))} disabled={reportingsLoading} className="rounded-xl border border-brand-100 px-3 py-2 text-xs font-semibold text-brand-700 disabled:opacity-50">
                  Atualizar apontamentos
                </button>
              </div>
              {reportingsLoading ? <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-700">Carregando apontamentos da unidade...</p> : null}
              {reportingsError ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{reportingsError}</p> : null}
              {!reportingsLoading && !reportingsError && !selected.reportings.items?.length ? <p className="rounded-2xl bg-brand-50 p-4 text-sm text-surface-700">A API informou apontamentos para esta unidade, mas não retornou registros para exibição.</p> : null}
              {reportingItems.length ? <><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-brand-100 text-xs uppercase tracking-wide text-surface-600"><tr><th className="p-3">Número</th><th className="p-3">Rodovia</th><th className="p-3">Km</th><th className="p-3">Tipo</th><th className="p-3">Status</th></tr></thead><tbody>{paginatedReportings.map((item, index) => <tr key={item.id || index} className="border-b border-brand-50"><td className="p-3">{item.number || '—'}</td><td className="p-3">{item.roadName || '—'}</td><td className="p-3">{item.km ?? '—'}</td><td className="p-3">{item.occurrenceType || '—'}</td><td className="p-3">{item.status || '—'}</td></tr>)}</tbody></table></div><Pagination page={reportingsPage} pageSize={reportingsPageSize} total={reportingItems.length} onPageChange={setReportingsPage} onPageSizeChange={setReportingsPageSize} /></> : null}
            </div>
          ) : null}

          {tab === 'alerts' ? (
            <div className="mt-5 grid gap-3">{alerts.length ? alerts.map((alert) => <article key={alert.id} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4"><div className="flex justify-between gap-4"><h3 className="font-semibold text-surface-900">{alert.title}</h3><span className="text-sm font-semibold text-brand-700">{alert.count ?? ''}</span></div>{alert.desc ? <p className="mt-2 text-sm text-surface-700">{alert.desc}</p> : null}{alert.action ? <p className="mt-2 text-xs font-medium text-brand-700">Ação: {alert.action}</p> : null}</article>) : <p className="p-4 text-sm text-surface-700">Nenhum alerta para esta concessão.</p>}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
