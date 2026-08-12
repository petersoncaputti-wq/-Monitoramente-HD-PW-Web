import { useEffect, useMemo, useState } from 'react';
import {
  loadKartadoCompanies,
  loadKartadoConcession,
  searchKartadoUsers,
  type KartadoConcessionDashboard,
  type KartadoCompany,
  type KartadoUser,
} from '@/services/kartadoService';

type KartadoTab = 'overview' | 'users' | 'reportings' | 'alerts';

const tabs: Array<{ id: KartadoTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'users', label: 'Usuários' },
  { id: 'reportings', label: 'Apontamentos' },
  { id: 'alerts', label: 'Alertas' },
];

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[22px] border border-brand-100 bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-700">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-surface-900">{value}</p>
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

export function KartadoPage() {
  const [companies, setCompanies] = useState<KartadoCompany[]>([]);
  const [concessions, setConcessions] = useState<Record<string, KartadoConcessionDashboard>>({});
  const [failedCompanies, setFailedCompanies] = useState<Record<string, string>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState('');
  const [tab, setTab] = useState<KartadoTab>('overview');
  const [search, setSearch] = useState('');
  const [remoteUsers, setRemoteUsers] = useState<KartadoUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    setSelectedUuid('');
    setConcessions({});
    setFailedCompanies({});
    setCompletedCount(0);
    try {
      const nextCompanies = await loadKartadoCompanies();
      setCompanies(nextCompanies);
      if (!nextCompanies.length) throw new Error('A conta Kartado não possui concessões ativas disponíveis.');

      await Promise.allSettled(
        nextCompanies.map(async (company) => {
          const uuid = company.uuid || company.id || '';
          try {
            const concession = await loadKartadoConcession(company);
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

  async function selectCompany(company: KartadoCompany) {
    const uuid = company.uuid || company.id || '';
    setSelectedUuid(uuid);
    setRemoteUsers(null);
    if (concessions[uuid]) return;
    setLoading(true);
    setError('');
    try {
      const concession = await loadKartadoConcession(company);
      setConcessions((current) => ({ ...current, [uuid]: concession }));
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

  const alerts = [...(selected?.users.alertas || []), ...(selected?.reportings.alerts || [])];

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
              onClick={() => void refresh()}
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

      {companies.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Usuários ativos" value={totals.users} />
          <MetricCard label="Apontamentos" value={totals.reportings} />
          <MetricCard label="Alertas" value={totals.alerts} />
          <MetricCard label="Críticos" value={totals.critical} />
        </div>
      ) : null}

      {companies.length ? (
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
                    {isPending ? 'Carregando...' : failure ? 'Indisponível — clique para tentar novamente' : `${Number(concession.summary.usuariosAtivos || 0)} usuários · ${Number(concession.summary.apontamentosTotal || 0)} apontamentos`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-[28px] border border-brand-100 bg-white p-3 shadow-soft sm:p-5">
          <nav className="flex flex-wrap gap-2" aria-label="Navegação Kartado">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${tab === item.id ? 'bg-brand-700 text-white' : 'text-surface-700 hover:bg-brand-50'}`}>
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'overview' ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Concessão" value={selected.company.name} />
              <MetricCard label="Usuários" value={Number(selected.summary.usuariosAtivos || 0)} />
              <MetricCard label="Apontamentos" value={Number(selected.summary.apontamentosTotal || 0)} />
              <MetricCard label="Saúde" value={`${Number(selected.summary.saudeScore || 0)}/100`} />
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
                  <tbody>{users.map((user, index) => <tr key={user.id || index} className="border-b border-brand-50"><td className="p-3">{riskLabel(user)}</td><td className="p-3 font-medium text-surface-900">{user.fullName || '—'}</td><td className="p-3">{user.username || '—'}</td><td className="p-3">{user.email || '—'}</td><td className="p-3">{user.expirationDate || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'reportings' ? (
            <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-brand-100 text-xs uppercase tracking-wide text-surface-600"><tr><th className="p-3">Número</th><th className="p-3">Rodovia</th><th className="p-3">Km</th><th className="p-3">Tipo</th><th className="p-3">Status</th></tr></thead><tbody>{(selected.reportings.items || selected.reportings.recent || []).map((item, index) => <tr key={item.id || index} className="border-b border-brand-50"><td className="p-3">{item.number || '—'}</td><td className="p-3">{item.roadName || '—'}</td><td className="p-3">{item.km ?? '—'}</td><td className="p-3">{item.occurrenceType || '—'}</td><td className="p-3">{item.status || '—'}</td></tr>)}</tbody></table></div>
          ) : null}

          {tab === 'alerts' ? (
            <div className="mt-5 grid gap-3">{alerts.length ? alerts.map((alert) => <article key={alert.id} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4"><div className="flex justify-between gap-4"><h3 className="font-semibold text-surface-900">{alert.title}</h3><span className="text-sm font-semibold text-brand-700">{alert.count ?? ''}</span></div>{alert.desc ? <p className="mt-2 text-sm text-surface-700">{alert.desc}</p> : null}{alert.action ? <p className="mt-2 text-xs font-medium text-brand-700">Ação: {alert.action}</p> : null}</article>) : <p className="p-4 text-sm text-surface-700">Nenhum alerta para esta concessão.</p>}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
