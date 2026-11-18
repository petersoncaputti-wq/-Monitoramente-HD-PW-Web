// Rotas do painel: fonte única para a moldura (DashboardPage) e para as áreas
// que navegam entre abas (ex.: ProjectWisePage).
export type DashboardTab =
  | 'storage'
  | 'projectWiseUsers'
  | 'tickets'
  | 'kartadoAudit'
  | 'kartadoHealth'
  | 'kartadoEco'
  | 'kartadoTickets'
  | 'totvs'
  | 'settings';

export const DASHBOARD_ROUTES: Record<DashboardTab, string> = {
  totvs: '/totvs/chamados',
  storage: '/projectwise/armazenamento',
  projectWiseUsers: '/projectwise/usuarios-pw',
  tickets: '/projectwise/chamados',
  kartadoAudit: '/kartado/auditoria',
  kartadoHealth: '/kartado/saude',
  kartadoEco: '/kartado/acompanhamento-eco',
  kartadoTickets: '/kartado/chamados',
  settings: '/configuracoes',
};

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  totvs: 'Chamados',
  storage: 'Armazenamento',
  projectWiseUsers: 'Usuários PW',
  tickets: 'Chamados',
  kartadoAudit: 'Auditoria',
  kartadoHealth: 'Saúde',
  kartadoEco: 'Acompanhamento',
  kartadoTickets: 'Chamados',
  settings: 'Configurações',
};

export const LEGACY_DASHBOARD_ROUTES: Record<string, string> = {
  '/armazenamento': DASHBOARD_ROUTES.storage,
  '/usuarios-pw': DASHBOARD_ROUTES.projectWiseUsers,
  '/chamados': DASHBOARD_ROUTES.tickets,
  '/projectwise/configuracoes': DASHBOARD_ROUTES.settings,
};

export function getDashboardTab(pathname: string): DashboardTab | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedRoute = Object.entries(DASHBOARD_ROUTES).find(([, route]) => route === normalizedPath);
  return (matchedRoute?.[0] as DashboardTab | undefined) ?? null;
}

export type ProjectWiseTab = Extract<DashboardTab, 'storage' | 'projectWiseUsers' | 'tickets'>;

export function isProjectWiseTab(tab: DashboardTab | null): tab is ProjectWiseTab {
  return tab === 'storage' || tab === 'projectWiseUsers' || tab === 'tickets';
}
