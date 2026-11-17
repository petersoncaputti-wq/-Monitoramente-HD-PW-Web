import { lazy, Suspense, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { EngineeringSystemsHomePage } from '@/pages/EngineeringSystemsHomePage';

// Cada área vira um arquivo JavaScript próprio, baixado só quando é aberta.
// A página inicial fica no pacote principal (é a primeira tela).
const ProjectWisePage = lazy(() => import('@/pages/ProjectWisePage').then((m) => ({ default: m.ProjectWisePage })));
const KartadoPage = lazy(() => import('@/pages/KartadoPage').then((m) => ({ default: m.KartadoPage })));
const KartadoTicketsPage = lazy(() =>
  import('@/pages/KartadoTicketsPage').then((m) => ({ default: m.KartadoTicketsPage })),
);
const KartadoEcoPage = lazy(() => import('@/pages/KartadoEcoPage').then((m) => ({ default: m.KartadoEcoPage })));
const TotvsPage = lazy(() => import('@/pages/TotvsPage').then((m) => ({ default: m.TotvsPage })));
const UserSettingsPage = lazy(() => import('@/pages/UserSettingsPage').then((m) => ({ default: m.UserSettingsPage })));

function PageLoading() {
  return (
    <div
      role="status"
      className="mt-6 rounded-[24px] border border-brand-100 bg-white px-6 py-5 text-sm text-surface-700 shadow-soft"
    >
      Carregando...
    </div>
  );
}
import {
  DASHBOARD_ROUTES,
  DASHBOARD_TAB_LABELS,
  getDashboardTab,
  isProjectWiseTab,
  LEGACY_DASHBOARD_ROUTES,
} from '@/pages/dashboardRoutes';

export function DashboardPage() {
  const { logout, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getDashboardTab(location.pathname);
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isHomePage = normalizedPath === '/';
  const isProjectWisePage = isProjectWiseTab(activeTab);
  const isKartadoPage =
    activeTab === 'kartadoAudit' ||
    activeTab === 'kartadoHealth' ||
    activeTab === 'kartadoEco' ||
    activeTab === 'kartadoTickets';

  useEffect(() => {
    const requestedTab = getDashboardTab(location.pathname);
    const requestedPath = location.pathname.replace(/\/+$/, '') || '/';

    if (requestedPath === '/') {
      return;
    }

    if (requestedPath === '/projectwise') {
      navigate(DASHBOARD_ROUTES.storage, { replace: true });
      return;
    }

    if (requestedPath === '/totvs') {
      navigate(DASHBOARD_ROUTES.totvs, { replace: true });
      return;
    }

    if (requestedPath === '/kartado') {
      navigate(DASHBOARD_ROUTES.kartadoAudit, { replace: true });
      return;
    }

    if (requestedPath === '/kartado/score') {
      navigate(DASHBOARD_ROUTES.kartadoHealth, { replace: true });
      return;
    }

    const migratedRoute = LEGACY_DASHBOARD_ROUTES[requestedPath];
    if (migratedRoute) {
      navigate(migratedRoute, { replace: true });
      return;
    }

    if (!requestedTab) {
      navigate('/', { replace: true });
      return;
    }

    if (requestedTab === 'settings' && profile && profile.role !== 'admin') {
      navigate(DASHBOARD_ROUTES.storage, { replace: true });
    }
  }, [location.pathname, navigate, profile]);

  return (
    <main className="min-h-screen">
      <header className="w-full border-b border-brand-100 bg-white/95 shadow-soft backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Painel institucional</p>
            <h1 className="mt-2 text-2xl font-semibold text-surface-900 md:text-3xl">
              Painel de indicadores de Sistemas de Engenharia
            </h1>
          </div>

          <div className="flex shrink-0 items-center rounded-[20px] bg-white px-2 py-2">
            <img
              src="/images/ecorodovias-logo.png"
              alt="Logo Ecorodovias"
              className="h-auto w-full max-w-[220px] object-contain"
            />
          </div>

          <div className="flex flex-col items-start gap-2 rounded-[20px] border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-surface-700 lg:items-end">
            <span className="font-semibold text-surface-900">{profile?.email}</span>
            <span className="text-xs uppercase tracking-[0.16em] text-brand-700">
              {profile?.role === 'admin' ? 'Administrador' : 'Usuário padrão'}
            </span>
            {profile?.role === 'admin' ? (
              <NavLink
                to={DASHBOARD_ROUTES.settings}
                className="text-xs font-semibold text-brand-700 transition hover:text-brand-900"
              >
                Configurações
              </NavLink>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-xs font-semibold text-brand-700 transition hover:text-brand-900"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav
          aria-label="Trilha de navegação"
          className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-600"
        >
          {isHomePage ? (
            <span className="font-semibold text-surface-900" aria-current="page">
              Início
            </span>
          ) : (
            <NavLink to="/" className="font-medium transition hover:text-brand-700">
              Início
            </NavLink>
          )}
          {activeTab === 'settings' ? (
            <>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <span className="font-semibold text-surface-900" aria-current="page">
                Configurações
              </span>
            </>
          ) : activeTab === 'totvs' ? (
            <>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <span>MGI</span>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <span className="font-semibold text-surface-900" aria-current="page">
                Chamados
              </span>
            </>
          ) : isKartadoPage ? (
            <>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <NavLink
                to={DASHBOARD_ROUTES.kartadoAudit}
                className="font-medium text-surface-700 transition hover:text-brand-700"
              >
                Kartado
              </NavLink>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <span className="font-semibold text-surface-900" aria-current="page">
                {activeTab ? DASHBOARD_TAB_LABELS[activeTab] : ''}
              </span>
            </>
          ) : activeTab ? (
            <>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <NavLink
                to={DASHBOARD_ROUTES.storage}
                className="font-medium text-surface-700 transition hover:text-brand-700"
              >
                ProjectWise
              </NavLink>
              <span aria-hidden="true" className="text-brand-300">
                /
              </span>
              <span className="font-semibold text-surface-900" aria-current="page">
                {DASHBOARD_TAB_LABELS[activeTab]}
              </span>
            </>
          ) : null}
        </nav>

        {isProjectWisePage ? (
          <nav
            aria-label="Navegação do ProjectWise"
            className="mt-4 flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2 shadow-soft"
          >
            <NavLink
              to={DASHBOARD_ROUTES.storage}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-700 text-white shadow-soft'
                    : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
                }`
              }
            >
              Armazenamento
            </NavLink>
            <NavLink
              to={DASHBOARD_ROUTES.projectWiseUsers}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-700 text-white shadow-soft'
                    : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
                }`
              }
            >
              Usuários PW
            </NavLink>
            <NavLink
              to={DASHBOARD_ROUTES.tickets}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-700 text-white shadow-soft'
                    : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
                }`
              }
            >
              Chamados
            </NavLink>
          </nav>
        ) : null}

        {isKartadoPage ? (
          <nav
            aria-label="Navegação do Kartado"
            className="mt-4 flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2 shadow-soft"
          >
            <NavLink
              to={DASHBOARD_ROUTES.kartadoAudit}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-brand-700 text-white shadow-soft' : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'}`
              }
            >
              Auditoria
            </NavLink>
            <NavLink
              to={DASHBOARD_ROUTES.kartadoHealth}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-brand-700 text-white shadow-soft' : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'}`
              }
            >
              Saúde
            </NavLink>
            <NavLink
              to={DASHBOARD_ROUTES.kartadoEco}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-brand-700 text-white shadow-soft' : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'}`
              }
            >
              Acompanhamento
            </NavLink>
            <NavLink
              to={DASHBOARD_ROUTES.kartadoTickets}
              className={({ isActive }) =>
                `rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-brand-700 text-white shadow-soft' : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'}`
              }
            >
              Chamados
            </NavLink>
          </nav>
        ) : null}

        {isHomePage ? <EngineeringSystemsHomePage /> : null}
        <Suspense fallback={<PageLoading />}>
          {activeTab === 'totvs' ? (
            <TotvsPage
              canManage={
                profile?.role === 'admin' ||
                (import.meta.env.DEV && import.meta.env.VITE_TOTVS_LOCAL_PREVIEW === 'true')
              }
            />
          ) : null}

          {activeTab === 'kartadoAudit' ? <KartadoPage area="audit" /> : null}
          {activeTab === 'kartadoHealth' ? <KartadoPage area="health" /> : null}
          {activeTab === 'kartadoEco' ? <KartadoEcoPage /> : null}
          {activeTab === 'kartadoTickets' ? <KartadoTicketsPage /> : null}

          {isProjectWiseTab(activeTab) ? <ProjectWisePage activeTab={activeTab} /> : null}

          {activeTab === 'settings' ? <UserSettingsPage /> : null}
        </Suspense>
      </div>
    </main>
  );
}
