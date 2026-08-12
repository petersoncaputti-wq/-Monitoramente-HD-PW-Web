import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AverageGrowthRateCard } from '@/components/AverageGrowthRateCard';
import { FreeSpaceCard } from '@/components/FreeSpaceCard';
import { LastUpdateCard } from '@/components/LastUpdateCard';
import { PeriodFilter } from '@/components/PeriodFilter';
import { PeriodVariationCard } from '@/components/PeriodVariationCard';
import { ProjectWiseUsersTab } from '@/components/ProjectWiseUsersTab';
import { SourceUpdateProgress } from '@/components/SourceUpdateProgress';
import { TicketsTab } from '@/components/TicketsTab';
import { TwelveMonthForecastCard } from '@/components/TwelveMonthForecastCard';
import { TotalCapacityCard } from '@/components/TotalCapacityCard';
import { UsagePercentageCard } from '@/components/UsagePercentageCard';
import { UsedSpaceCard } from '@/components/UsedSpaceCard';
import { useAuth } from '@/contexts/AuthContext';
import { UserSettingsPage } from '@/pages/UserSettingsPage';
import { EngineeringSystemsHomePage } from '@/pages/EngineeringSystemsHomePage';
import { KartadoPage } from '@/pages/KartadoPage';
import {
  getDatePeriodPreset,
  getDefaultDatePeriod,
  type DatePeriodPreset,
} from '@/utils/datePeriod';
import type {
  ImportedWorkbookData,
  E365UsageRow,
  MonitoringRow,
  ProjectWiseWebUserRow,
  TicketRow,
} from '@/types/monitoring';
import {
  deleteE365Quarter,
  importE365UsageFile,
  readE365UsageFromDatabase,
} from '@/services/e365UsagePersistenceService';
import { formatE365Quarter } from '@/utils/e365UsageKpis';
import { readMonitoringWorkbookFromUrl } from '@/services/excelService';
import { importProjectWiseUsersFile } from '@/services/projectWiseUsersImportService';
import {
  hasSupabaseProjectWiseUsersConfig,
  readProjectWisePortalUsersFromSupabase,
} from '@/services/projectWiseUsersService';
import {
  hasSupabaseStorageConfig,
  readStorageReadingsFromSupabase,
} from '@/services/storageReadingsService';
import { importStorageCsvFile } from '@/services/storageImportService';
import {
  createTicket,
  deleteTicket,
  hasSupabaseTicketsConfig,
  readTicketsFromSupabase,
  updateTicket,
  type TicketInput,
} from '@/services/ticketsService';
import {
  combineRowDateTime,
  getAverageGrowthRateKpi,
  getFreeSpaceKpi,
  getLatestUpdateKpi,
  getPeriodVariationKpi,
  getTwelveMonthForecastKpi,
  getTotalCapacityKpi,
  getUsagePercentageKpi,
  getUsedSpaceKpi,
} from '@/utils/monitoringKpis';

function formatInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLatestE365Quarter(rows: E365UsageRow[]): string {
  const quarters = [...new Set(rows.map((row) => row.UsageQuarter).filter(Boolean))].sort();
  return quarters[quarters.length - 1] ?? '';
}

function parseInputDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function getRowsDateRange(rows: MonitoringRow[]) {
  const validDates = rows
    .map(combineRowDateTime)
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (validDates.length === 0) {
    return null;
  }

  return {
    minDate: formatInputDate(validDates[0]),
    maxDate: formatInputDate(validDates[validDates.length - 1]),
  };
}

function filterRowsByPeriod(
  rows: MonitoringRow[],
  startDateValue: string,
  endDateValue: string,
) {
  const startDate = parseInputDate(startDateValue);
  const endDate = parseInputDate(endDateValue);

  if (!startDate && !endDate) {
    return rows;
  }

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  return rows.filter((row) => {
    const rowDate = combineRowDateTime(row);

    if (!rowDate) {
      return false;
    }

    if (startDate && rowDate < startDate) {
      return false;
    }

    if (endDate && rowDate > endDate) {
      return false;
    }

    return true;
  });
}

type DashboardTab = 'storage' | 'projectWiseUsers' | 'tickets' | 'kartado' | 'settings';

const DASHBOARD_ROUTES: Record<DashboardTab, string> = {
  storage: '/projectwise/armazenamento',
  projectWiseUsers: '/projectwise/usuarios-pw',
  tickets: '/projectwise/chamados',
  kartado: '/kartado',
  settings: '/configuracoes',
};

const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  storage: 'Armazenamento',
  projectWiseUsers: 'Usuários PW',
  tickets: 'Chamados',
  kartado: 'Kartado',
  settings: 'Configurações',
};

const LEGACY_DASHBOARD_ROUTES: Record<string, string> = {
  '/armazenamento': DASHBOARD_ROUTES.storage,
  '/usuarios-pw': DASHBOARD_ROUTES.projectWiseUsers,
  '/chamados': DASHBOARD_ROUTES.tickets,
  '/projectwise/configuracoes': DASHBOARD_ROUTES.settings,
};

function getDashboardTab(pathname: string): DashboardTab | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const matchedRoute = Object.entries(DASHBOARD_ROUTES).find(
    ([, route]) => route === normalizedPath,
  );
  return (matchedRoute?.[0] as DashboardTab | undefined) ?? null;
}

const AUTO_STORAGE_SOURCES = [
  'dados/armazenamento.xlsx',
  'dados/armazenamento.xls',
  'dados/armazenamento.csv',
  'dados/armazenamento.xml',
];

const AUTO_TICKET_SOURCES = [
  'dados/chamados.xlsx',
  'dados/chamados.xls',
  'dados/chamados.csv',
  'dados/chamados.xml',
];

const AUTO_PROJECT_WISE_PORTAL_USER_SOURCES = [
  'dados/usuarios-pw-portal.xlsx',
  'dados/usuarios-pw-portal.xls',
  'dados/usuarios-pw-portal.csv',
];

const EXTERNAL_STORAGE_SOURCE_URL = import.meta.env.VITE_STORAGE_SOURCE_URL?.trim();
const IS_E365_LOCAL_PREVIEW = import.meta.env.VITE_E365_LOCAL_PREVIEW === 'true';

const STORAGE_UPDATE_STEPS = [
  'Conectando ao Supabase',
  'Lendo registros de armazenamento',
  'Validando linhas retornadas',
  'Recarregando indicadores',
];

const TICKETS_UPDATE_STEPS = [
  'Lendo planilha de chamados no OneDrive',
  'Copiando fonte para a pasta publica',
  'Validando linhas da planilha',
  'Recarregando indicadores de chamados',
];

const PROJECT_WISE_USERS_UPDATE_STEPS = [
  'Validando arquivo E365 Usage Data',
  'Identificando quarters e aplicações',
  'Atualizando usuários faturados',
  'Recarregando indicadores E365',
];

const PORTAL_USERS_UPDATE_STEPS = [
  'Lendo arquivo do PW Web no OneDrive',
  'Copiando fonte para a pasta publica',
  'Normalizando cabeçalhos do Portal Bentley',
  'Recarregando comparativo de usuários',
];

const TICKETS_PAGE_SIZE = 20;

type AutoStorageStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | {
      state: 'ready';
      fileName: string;
      loadedAt: Date;
      rowsCount: number;
      syncInfo?: StorageSyncInfo;
    }
  | { state: 'missing' }
  | { state: 'error'; message: string };

type StorageCsvImportStatus =
  | { state: 'idle' }
  | { state: 'importing' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

type ProjectWiseUsersImportStatus =
  | { state: 'idle' }
  | { state: 'importing' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

type TicketFormStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

interface StorageSyncInfo {
  sourcePath: string;
  destinationPath: string;
  sourceSize: number;
  destinationSize: number;
  sourceHash: string;
  destinationHash: string;
  sourceRowsCount: number;
  destinationRowsCount: number;
  sourceSheetName: string | null;
  destinationSheetName: string | null;
  sourceModifiedAt: string;
  destinationModifiedAt: string;
  syncedAt: string;
}

interface StorageSyncResponse {
  error?: string;
  sync?: StorageSyncInfo;
}

function getPublicUrl(path: string, cacheKey?: string): string {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  const url = `${baseUrl}${path}`;

  if (!cacheKey) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`;
}

function getAutoStorageSources(options?: { cacheKey?: string; localOnly?: boolean }) {
  const localSources = AUTO_STORAGE_SOURCES.map((source) => ({
    url: getPublicUrl(source, options?.cacheKey),
    fileName: source,
  }));

  if (options?.localOnly || !EXTERNAL_STORAGE_SOURCE_URL) {
    return localSources;
  }

  return [
    {
      url: EXTERNAL_STORAGE_SOURCE_URL,
      fileName: 'OneDrive - armazenamento',
    },
    ...localSources,
  ];
}

function formatTechnicalDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '-';
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBytes(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatShortHash(value: string) {
  return value ? value.slice(0, 10) : '-';
}

function hasHeaderError(message: string) {
  return message.includes('cabeçalhos') || message.includes('cabecalhos');
}

async function syncLocalStorageSource(): Promise<StorageSyncInfo | undefined> {
  const response = await fetch('/api/sync-storage', {
    method: 'POST',
  });

  if (response.status === 404) {
    return undefined;
  }

  const result = (await response.json().catch(() => null)) as StorageSyncResponse | null;

  if (!response.ok) {
    throw new Error(result?.error ?? 'Não foi possível sincronizar a fonte local.');
  }

  return result?.sync;
}

async function syncLocalTicketsSource(): Promise<StorageSyncInfo | undefined> {
  const response = await fetch('/api/sync-tickets', {
    method: 'POST',
  });

  if (response.status === 404) {
    return undefined;
  }

  const result = (await response.json().catch(() => null)) as StorageSyncResponse | null;

  if (!response.ok) {
    throw new Error(result?.error ?? 'Não foi possível sincronizar a fonte local de chamados.');
  }

  return result?.sync;
}

async function syncLocalProjectWisePortalUsersSource(): Promise<StorageSyncInfo | undefined> {
  const response = await fetch('/api/sync-portal-users', {
    method: 'POST',
  });

  if (response.status === 404) {
    return undefined;
  }

  const result = (await response.json().catch(() => null)) as StorageSyncResponse | null;

  if (!response.ok) {
    throw new Error(
      result?.error ?? 'Não foi possível atualizar a fonte de usuários do Portal Bentley.',
    );
  }

  return result?.sync;
}

function isMonitoringRow(row: ImportedWorkbookData['rows'][number]): row is MonitoringRow {
  return 'TotalGB' in row && 'UsadoGB' in row && 'LivreGB' in row;
}

function isTicketRow(row: ImportedWorkbookData['rows'][number]): row is TicketRow {
  return 'StatusdoSLA' in row && 'Tipodeticket' in row && 'Abertoem' in row;
}

function isProjectWiseWebUserRow(
  row: ImportedWorkbookData['rows'][number],
): row is ProjectWiseWebUserRow {
  return 'Email' in row && 'LastLoginDate' in row && 'Locked' in row;
}

export function DashboardPage() {
  const { accessToken, getValidAccessToken, logout, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getDashboardTab(location.pathname);
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isHomePage = normalizedPath === '/';
  const isProjectWisePage =
    activeTab === 'storage' || activeTab === 'projectWiseUsers' || activeTab === 'tickets';
  const [storageData, setStorageData] = useState<ImportedWorkbookData | null>(null);
  const [ticketsData, setTicketsData] = useState<ImportedWorkbookData | null>(null);
  const [projectWisePortalUsersData, setProjectWisePortalUsersData] =
    useState<ImportedWorkbookData | null>(null);
  const [e365UsageRows, setE365UsageRows] = useState<E365UsageRow[]>([]);
  const [autoStorageStatus, setAutoStorageStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoTicketsStatus, setAutoTicketsStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoProjectWiseUsersStatus, setAutoProjectWiseUsersStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoProjectWisePortalUsersStatus, setAutoProjectWisePortalUsersStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [storageCsvFiles, setStorageCsvFiles] = useState<File[]>([]);
  const [storageCsvImportStatus, setStorageCsvImportStatus] =
    useState<StorageCsvImportStatus>({ state: 'idle' });
  const [projectWiseExplorerFile, setProjectWiseExplorerFile] = useState<File | null>(null);
  const [projectWisePortalFile, setProjectWisePortalFile] = useState<File | null>(null);
  const [projectWiseExplorerImportStatus, setProjectWiseExplorerImportStatus] =
    useState<ProjectWiseUsersImportStatus>({ state: 'idle' });
  const [projectWisePortalImportStatus, setProjectWisePortalImportStatus] =
    useState<ProjectWiseUsersImportStatus>({ state: 'idle' });
  const [ticketForm, setTicketForm] = useState<TicketInput>({
    openedAt: '',
    status: 'Novo',
  });
  const [ticketFormStatus, setTicketFormStatus] = useState<TicketFormStatus>({ state: 'idle' });
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [ticketColumnFilters, setTicketColumnFilters] = useState({
    caseNumber: '',
    requester: '',
    status: '',
  });
  const [ticketPage, setTicketPage] = useState(1);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const rows = useMemo(
    () => (storageData?.rows.filter(isMonitoringRow) ?? []),
    [storageData],
  );
  const projectWiseWebUserRows = useMemo(
    () => projectWisePortalUsersData?.rows.filter(isProjectWiseWebUserRow) ?? [],
    [projectWisePortalUsersData],
  );
  const ticketRows = useMemo(
    () => (ticketsData?.rows.filter(isTicketRow) ?? []),
    [ticketsData],
  );
  const getTicketValue = (row: TicketRow, targetKey: string) => {
    const normalizeKey = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    const normalizedTarget = normalizeKey(targetKey);
    const entry = Object.entries(row).find(([key]) => normalizeKey(key) === normalizedTarget);
    return String(entry?.[1] ?? '');
  };
  const getTicketCaseNumber = (row: TicketRow) =>
    getTicketValue(row, 'Caso n') || getTicketValue(row, 'Cason');
  const normalizeTicketFilterValue = (value: unknown) =>
    String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const requesterHistory = useMemo(() => {
    const counts = new Map<string, { count: number; value: string }>();

    for (const row of ticketRows) {
      const value = String(row.Solicitante ?? '').trim();
      const key = normalizeTicketFilterValue(value);

      if (!key) {
        continue;
      }

      const current = counts.get(key);
      counts.set(key, { count: (current?.count ?? 0) + 1, value: current?.value ?? value });
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'pt-BR'))
      .slice(0, 50);
  }, [ticketRows]);
  const organizationHistory = useMemo(() => {
    const selectedRequester = normalizeTicketFilterValue(ticketForm.requester);
    const counts = new Map<string, { count: number; requesterMatches: number; value: string }>();

    for (const row of ticketRows) {
      const value =
        getTicketValue(row, 'Organizaçãodobeneficiário') ||
        getTicketValue(row, 'Organizaçãodosolicitante');
      const key = normalizeTicketFilterValue(value);

      if (!key) {
        continue;
      }

      const current = counts.get(key);
      const requesterMatches =
        selectedRequester &&
        normalizeTicketFilterValue(row.Solicitante) === selectedRequester
          ? 1
          : 0;
      counts.set(key, {
        count: (current?.count ?? 0) + 1,
        requesterMatches: (current?.requesterMatches ?? 0) + requesterMatches,
        value: current?.value ?? value,
      });
    }

    return [...counts.values()]
      .sort(
        (a, b) =>
          b.requesterMatches - a.requesterMatches ||
          b.count - a.count ||
          a.value.localeCompare(b.value, 'pt-BR'),
      )
      .slice(0, 50);
  }, [ticketForm.requester, ticketRows]);
  const ticketStatusOptions = useMemo(
    () =>
      Array.from(
        new Set(ticketRows.map((row) => String(row.Status ?? '').trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [ticketRows],
  );
  const filteredAdminTicketRows = useMemo(() => {
    const normalizedTerm = normalizeTicketFilterValue(ticketSearchTerm);
    const normalizedColumnFilters = {
      caseNumber: normalizeTicketFilterValue(ticketColumnFilters.caseNumber),
      requester: normalizeTicketFilterValue(ticketColumnFilters.requester),
      status: normalizeTicketFilterValue(ticketColumnFilters.status),
    };

    return ticketRows.filter((row) => {
      const rowMatchesGeneralSearch =
        !normalizedTerm ||
        [
          getTicketCaseNumber(row),
          row.Status,
          row.Solicitante,
          row.Motivo,
          row.Tipodeticket,
          row.StatusdoSLA,
        ].some((value) => normalizeTicketFilterValue(value).includes(normalizedTerm));

      return (
        rowMatchesGeneralSearch &&
        (!normalizedColumnFilters.caseNumber ||
          normalizeTicketFilterValue(getTicketCaseNumber(row)).includes(
            normalizedColumnFilters.caseNumber,
          )) &&
        (!normalizedColumnFilters.status ||
          normalizeTicketFilterValue(row.Status) === normalizedColumnFilters.status) &&
        (!normalizedColumnFilters.requester ||
          normalizeTicketFilterValue(row.Solicitante).includes(normalizedColumnFilters.requester))
      );
    });
  }, [ticketRows, ticketSearchTerm, ticketColumnFilters]);
  const hasTicketFilters =
    Boolean(ticketSearchTerm.trim()) ||
    Object.values(ticketColumnFilters).some((value) => Boolean(value.trim()));
  const clearTicketFilters = () => {
    setTicketSearchTerm('');
    setTicketColumnFilters({
      caseNumber: '',
      requester: '',
      status: '',
    });
  };
  const totalTicketPages = Math.max(
    1,
    Math.ceil(filteredAdminTicketRows.length / TICKETS_PAGE_SIZE),
  );
  const visibleTicketPage = Math.min(ticketPage, totalTicketPages);
  const ticketPageStartIndex = (visibleTicketPage - 1) * TICKETS_PAGE_SIZE;
  const paginatedAdminTicketRows = filteredAdminTicketRows.slice(
    ticketPageStartIndex,
    ticketPageStartIndex + TICKETS_PAGE_SIZE,
  );
  const firstTicketOnPage =
    filteredAdminTicketRows.length === 0 ? 0 : ticketPageStartIndex + 1;
  const lastTicketOnPage = Math.min(
    ticketPageStartIndex + TICKETS_PAGE_SIZE,
    filteredAdminTicketRows.length,
  );

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

  useEffect(() => {
    setTicketPage(1);
  }, [ticketSearchTerm, ticketColumnFilters]);

  useEffect(() => {
    setTicketPage((currentPage) => Math.min(currentPage, totalTicketPages));
  }, [totalTicketPages]);
  const dateRange = useMemo(() => getRowsDateRange(rows), [rows]);
  const defaultStoragePeriod = useMemo(
    () => getDefaultDatePeriod(dateRange?.maxDate),
    [dateRange?.maxDate],
  );
  const isUsingLatestStorageMonth =
    defaultStoragePeriod.usedLatestAvailableMonth &&
    periodStartDate === defaultStoragePeriod.startDate &&
    periodEndDate === defaultStoragePeriod.endDate;
  const filteredRows = useMemo(
    () => filterRowsByPeriod(rows, periodStartDate, periodEndDate),
    [periodEndDate, periodStartDate, rows],
  );
  const latestUpdate = getLatestUpdateKpi(filteredRows);
  const totalCapacity = getTotalCapacityKpi(filteredRows);
  const usedSpace = getUsedSpaceKpi(filteredRows);
  const freeSpace = getFreeSpaceKpi(filteredRows);
  const usagePercentage = getUsagePercentageKpi(filteredRows);
  const periodVariation = getPeriodVariationKpi(filteredRows);
  const averageGrowthRate = getAverageGrowthRateKpi(filteredRows);
  const twelveMonthForecast = getTwelveMonthForecastKpi(filteredRows);

  function applyStorageData(data: ImportedWorkbookData, shouldOpenStorageTab: boolean) {
    const monitoringRows = data.rows.filter(isMonitoringRow);
    const range = getRowsDateRange(monitoringRows);

    setStorageData(data);

    if (shouldOpenStorageTab) {
      navigate(DASHBOARD_ROUTES.storage);
    }

    const defaultPeriod = getDefaultDatePeriod(range?.maxDate);
    setPeriodStartDate(defaultPeriod.startDate);
    setPeriodEndDate(defaultPeriod.endDate);
  }

  function applyTicketsData(data: ImportedWorkbookData) {
    setTicketsData(data);
  }

  function applyProjectWisePortalUsersData(data: ImportedWorkbookData) {
    setProjectWisePortalUsersData(data);
  }

  async function loadAutoStorageSource(options?: { syncBeforeRead?: boolean }) {
    setAutoStorageStatus({ state: 'loading' });

    if (hasSupabaseStorageConfig()) {
      if (!accessToken) {
        setAutoStorageStatus({
          state: 'error',
          message: 'Sessão autenticada indisponível para ler os dados de armazenamento.',
        });
        return;
      }

      try {
        const data = await readStorageReadingsFromSupabase(accessToken ?? undefined);

        applyStorageData(data, false);
        setAutoStorageStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os dados de armazenamento no Supabase.';

        setAutoStorageStatus({ state: 'error', message });
      }

      return;
    }

    let lastError: unknown = null;
    let externalSourceError: unknown = null;
    let syncInfo: StorageSyncInfo | undefined;
    const localCacheKey = String(Date.now());

    if (options?.syncBeforeRead) {
      try {
        syncInfo = await syncLocalStorageSource();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar a fonte local.';

        setAutoStorageStatus({ state: 'error', message });
        return;
      }
    }

    for (const source of getAutoStorageSources({
      cacheKey: localCacheKey,
      localOnly: options?.syncBeforeRead,
    })) {
      try {
        const data = await readMonitoringWorkbookFromUrl(source.url, source.fileName);

        if (data.kind !== 'storage') {
          throw new Error('A fonte encontrada não possui os cabeçalhos de armazenamento.');
        }

        applyStorageData(data, false);
        setAutoStorageStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
          syncInfo,
        });
        return;
      } catch (error) {
        if (EXTERNAL_STORAGE_SOURCE_URL && source.url === EXTERNAL_STORAGE_SOURCE_URL) {
          externalSourceError = error;
        }

        lastError = error;
      }
    }

    const message =
      externalSourceError instanceof Error
        ? externalSourceError.message
        : lastError instanceof Error
          ? lastError.message
          : 'Não foi possível carregar a fonte automática de armazenamento.';

    setAutoStorageStatus(
      EXTERNAL_STORAGE_SOURCE_URL || hasHeaderError(message)
        ? { state: 'error', message }
        : { state: 'missing' },
    );
  }

  async function importSelectedStorageCsv() {
    if (!accessToken || storageCsvFiles.length === 0) {
      return;
    }

    setStorageCsvImportStatus({ state: 'importing' });

    try {
      const validAccessToken = await getValidAccessToken();

      if (!validAccessToken) {
        throw new Error('Sessão expirada. Entre novamente para importar os arquivos.');
      }

      let totalRowsRead = 0;
      let totalRowsImported = 0;

      for (const file of storageCsvFiles) {
        const result = await importStorageCsvFile(validAccessToken, file);
        totalRowsRead += result.rowsRead;
        totalRowsImported += result.rowsImported;
      }

      setStorageCsvImportStatus({
        state: 'success',
        message: `${storageCsvFiles.length} arquivo(s) processado(s), ${totalRowsRead} linhas lidas e ${totalRowsImported} registros importados/atualizados.`,
      });
      setStorageCsvFiles([]);
      await loadAutoStorageSource();
    } catch (error) {
      setStorageCsvImportStatus({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível importar o CSV de armazenamento.',
      });
    }
  }

  async function importSelectedProjectWiseExplorerFile() {
    if (!accessToken || !projectWiseExplorerFile) {
      return;
    }

    setProjectWiseExplorerImportStatus({ state: 'importing' });

    try {
      const result = await importE365UsageFile(projectWiseExplorerFile);
      const nextRows = await readE365UsageFromDatabase();
      setE365UsageRows(nextRows);
      setProjectWiseExplorerImportStatus({
        state: 'success',
        message: `${result.rowsRead} linhas lidas e ${result.rowsImported} registros gravados. ${result.replacedQuarters.map(formatE365Quarter).join(', ')} foi substituído integralmente.`,
      });
      setProjectWiseExplorerFile(null);
      await loadAutoProjectWiseUsersSource();
    } catch (error) {
      setProjectWiseExplorerImportStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível importar o arquivo E365.',
      });
    }
  }

  async function clearLatestE365Quarter() {
    const usageQuarter = getLatestE365Quarter(e365UsageRows);
    if (!usageQuarter) return;

    const label = formatE365Quarter(usageQuarter);
    if (!window.confirm(`Remover todos os dados de ${label}? Essa ação prepara o quarter para uma nova importação.`)) {
      return;
    }

    setProjectWiseExplorerImportStatus({ state: 'importing' });
    try {
      const result = await deleteE365Quarter(usageQuarter);
      setE365UsageRows(await readE365UsageFromDatabase());
      setProjectWiseExplorerImportStatus({
        state: 'success',
        message: `${formatE365Quarter(result.usageQuarter)} removido: ${result.rowsDeleted} registros apagados.`,
      });
    } catch (error) {
      setProjectWiseExplorerImportStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível limpar o quarter E365.',
      });
    }
  }

  async function importSelectedProjectWisePortalFile() {
    if (!accessToken || !projectWisePortalFile) {
      return;
    }

    setProjectWisePortalImportStatus({ state: 'importing' });

    try {
      const validAccessToken = await getValidAccessToken();

      if (!validAccessToken) {
        throw new Error('Sessão expirada. Entre novamente para importar o arquivo.');
      }

      const result = await importProjectWiseUsersFile(
        validAccessToken,
        'portal',
        projectWisePortalFile,
      );

      setProjectWisePortalImportStatus({
        state: 'success',
        message: `${result.rowsRead} linhas lidas e ${result.rowsImported} usuários do Portal importados.`,
      });
      setProjectWisePortalFile(null);
      await loadAutoProjectWisePortalUsersSource();
    } catch (error) {
      setProjectWisePortalImportStatus({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível importar os usuários do Portal Bentley.',
      });
    }
  }

  function updateTicketForm<Field extends keyof TicketInput>(
    field: Field,
    value: TicketInput[Field],
  ) {
    setTicketForm((current) => ({ ...current, [field]: value }));
    setTicketFormStatus({ state: 'idle' });
  }

  function resetTicketForm() {
    setTicketForm({
      openedAt: '',
      status: 'Novo',
    });
    setTicketFormStatus({ state: 'idle' });
  }

  function editTicket(row: TicketRow) {
    const id = typeof row.__id === 'string' ? row.__id : '';
    const getValue = (targetKey: string) => {
      const normalizeKey = (value: string) =>
        value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase();
      const normalizedTarget = normalizeKey(targetKey);
      const entry = Object.entries(row).find(([key]) => normalizeKey(key) === normalizedTarget);
      return String(entry?.[1] ?? '');
    };
    const toDatetimeLocal = (value: unknown) => {
      const text = String(value ?? '').trim();

      if (!text) {
        return '';
      }

      const isoDate = new Date(text);

      if (!Number.isNaN(isoDate.getTime())) {
        const year = isoDate.getFullYear();
        const month = String(isoDate.getMonth() + 1).padStart(2, '0');
        const day = String(isoDate.getDate()).padStart(2, '0');
        const hours = String(isoDate.getHours()).padStart(2, '0');
        const minutes = String(isoDate.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})$/);

      if (match) {
        const [, day, month, year, hours, minutes] = match;
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      return '';
    };

    setTicketForm({
      assignedAgent: getValue('AgenteAtribuido'),
      assignedGroup: getValue('Grupoatribuido'),
      assignedTo: getValue('Atribuido'),
      beneficiaryOrganization: getValue('Organizaçãobeneficiario'),
      caseNumber: String(row.__caseNumber ?? '') || getTicketCaseNumber(row),
      closedAt: toDatetimeLocal(row.__closedAt || row.Fechadoem),
      id,
      openedAt: toDatetimeLocal(row.__openedAt || row.Abertoem),
      priority: String(row.Prioridade ?? ''),
      reason: String(row.Motivo ?? ''),
      requestedFor: String(row.Solicitadopara ?? ''),
      requester: String(row.Solicitante ?? ''),
      requesterOrganization: getValue('Organizaçãodosolicitante'),
      slaStatus: String(row.StatusdoSLA ?? ''),
      status: String(row.Status ?? 'Novo'),
      ticketType: String(row.Tipodeticket ?? ''),
      updatedAt: toDatetimeLocal(row.__updatedAt || row.Atualizado),
    });
    setTicketFormStatus({
      state: 'success',
      message: `Editando chamado ${String(row.__caseNumber ?? '') || getTicketCaseNumber(row) || id}.`,
    });
    window.setTimeout(() => {
      document.getElementById('ticket-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  async function saveTicketForm() {
    const validAccessToken = await getValidAccessToken();

    if (!validAccessToken) {
      setTicketFormStatus({
        state: 'error',
        message: 'Sessão expirada. Entre novamente para salvar o chamado.',
      });
      return;
    }

    setTicketFormStatus({ state: 'saving' });

    try {
      if (ticketForm.id) {
        await updateTicket(validAccessToken, ticketForm);
      } else {
        await createTicket(validAccessToken, ticketForm);
      }

      setTicketFormStatus({
        state: 'success',
        message: ticketForm.id ? 'Chamado atualizado.' : 'Chamado registrado.',
      });
      resetTicketForm();
      await loadAutoTicketsSource({ accessTokenOverride: validAccessToken });
    } catch (error) {
      setTicketFormStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível salvar o chamado.',
      });
    }
  }

  async function removeTicket(row: TicketRow) {
    const id = typeof row.__id === 'string' ? row.__id : '';

    if (!id || !window.confirm('Excluir este chamado?')) {
      return;
    }

    const validAccessToken = await getValidAccessToken();

    if (!validAccessToken) {
      setTicketFormStatus({
        state: 'error',
        message: 'Sessão expirada. Entre novamente para excluir o chamado.',
      });
      return;
    }

    try {
      await deleteTicket(validAccessToken, id);
      setTicketSearchTerm('');
      setTicketColumnFilters({
        caseNumber: '',
        requester: '',
        status: '',
      });
      setTicketPage(1);
      setTicketForm((currentForm) =>
        currentForm.id === id
          ? {
              openedAt: '',
              status: 'Novo',
            }
          : currentForm,
      );
      await loadAutoTicketsSource({ accessTokenOverride: validAccessToken });
      setTicketFormStatus({ state: 'success', message: 'Chamado excluído.' });
    } catch (error) {
      setTicketFormStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível excluir o chamado.',
      });
    }
  }

  async function loadAutoTicketsSource(options?: {
    accessTokenOverride?: string;
    syncBeforeRead?: boolean;
  }) {
    setAutoTicketsStatus({ state: 'loading' });

    if (hasSupabaseTicketsConfig()) {
      const ticketsAccessToken = options?.accessTokenOverride ?? accessToken;

      if (!ticketsAccessToken) {
        setAutoTicketsStatus({
          state: 'error',
          message: 'Sessão autenticada indisponível para ler os chamados.',
        });
        return;
      }

      try {
        const data = await readTicketsFromSupabase(ticketsAccessToken);

        applyTicketsData(data);
        setAutoTicketsStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
        });
      } catch (error) {
        setAutoTicketsStatus({
          state: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os chamados no Supabase.',
        });
      }

      return;
    }

    let lastError: unknown = null;
    let syncInfo: StorageSyncInfo | undefined;
    const localCacheKey = String(Date.now());

    if (options?.syncBeforeRead) {
      try {
        syncInfo = await syncLocalTicketsSource();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar a fonte local de chamados.';

        setAutoTicketsStatus({ state: 'error', message });
        return;
      }
    }

    for (const source of AUTO_TICKET_SOURCES.map((ticketSource) => ({
      fileName: ticketSource,
      url: getPublicUrl(ticketSource, localCacheKey),
    }))) {
      try {
        const data = await readMonitoringWorkbookFromUrl(source.url, source.fileName);

        if (data.kind !== 'tickets') {
          throw new Error('A fonte encontrada não possui os cabeçalhos de chamados.');
        }

        applyTicketsData(data);
        setAutoTicketsStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
          syncInfo,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : 'Não foi possível carregar a fonte automática de chamados.';

    setAutoTicketsStatus(
      hasHeaderError(message) ? { state: 'error', message } : { state: 'missing' },
    );
  }

  async function loadAutoProjectWiseUsersSource() {
    setAutoProjectWiseUsersStatus({ state: 'loading' });

    if (!accessToken) {
      setAutoProjectWiseUsersStatus({
        state: 'error',
        message: 'Sessão autenticada indisponível para ler os dados E365.',
      });
      return;
    }

    try {
      const data = await readE365UsageFromDatabase();
      setE365UsageRows(data);
      setAutoProjectWiseUsersStatus({
        state: 'ready',
        fileName: 'Azure PostgreSQL - e365_usage',
        loadedAt: new Date(),
        rowsCount: data.length,
      });
    } catch (error) {
      setAutoProjectWiseUsersStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível carregar os dados E365.',
      });
    }
  }

  async function loadAutoProjectWisePortalUsersSource(options?: { syncBeforeRead?: boolean }) {
    setAutoProjectWisePortalUsersStatus({ state: 'loading' });

    if (hasSupabaseProjectWiseUsersConfig()) {
      if (!accessToken) {
        setAutoProjectWisePortalUsersStatus({
          state: 'error',
          message: 'Sessão autenticada indisponível para ler os usuários do Portal Bentley.',
        });
        return;
      }

      try {
        const data = await readProjectWisePortalUsersFromSupabase(accessToken);

        applyProjectWisePortalUsersData(data);
        setAutoProjectWisePortalUsersStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os usuários do Portal Bentley no Supabase.';

        setAutoProjectWisePortalUsersStatus({ state: 'error', message });
      }

      return;
    }

    let lastError: unknown = null;
    let syncInfo: StorageSyncInfo | undefined;
    const localCacheKey = String(Date.now());

    if (options?.syncBeforeRead) {
      try {
        syncInfo = await syncLocalProjectWisePortalUsersSource();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a fonte de usuários do Portal Bentley.';

        setAutoProjectWisePortalUsersStatus({ state: 'error', message });
        return;
      }
    }

    for (const source of AUTO_PROJECT_WISE_PORTAL_USER_SOURCES.map((portalSource) => ({
      fileName: portalSource,
      url: getPublicUrl(portalSource, localCacheKey),
    }))) {
      try {
        const data = await readMonitoringWorkbookFromUrl(source.url, source.fileName);

        if (data.kind !== 'projectWiseWebUsers') {
          throw new Error(
            'A fonte encontrada não possui os cabeçalhos de usuários do Portal Bentley.',
          );
        }

        applyProjectWisePortalUsersData(data);
        setAutoProjectWisePortalUsersStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
          syncInfo,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : 'Não foi possível carregar a fonte automática de usuários do Portal Bentley.';

    setAutoProjectWisePortalUsersStatus(
      hasHeaderError(message) ? { state: 'error', message } : { state: 'missing' },
    );
  }

  useEffect(() => {
    if (isProjectWisePage && !hasSupabaseTicketsConfig()) {
      void loadAutoTicketsSource();
    }
  }, [isProjectWisePage]);

  useEffect(() => {
    if (!accessToken || !isProjectWisePage) {
      return;
    }

    void loadAutoStorageSource();
    void loadAutoTicketsSource();
    void loadAutoProjectWiseUsersSource();
    void loadAutoProjectWisePortalUsersSource();
    void readE365UsageFromDatabase()
      .then(setE365UsageRows)
      .catch((error) => console.error('Não foi possível carregar os dados E365.', error));
  }, [accessToken, isProjectWisePage]);

  async function importE365Files(files: File[]) {
    for (const file of files) {
      await importE365UsageFile(file);
    }
    const nextRows = await readE365UsageFromDatabase();
    setE365UsageRows(nextRows);
    return nextRows;
  }

  function applyPeriodPreset(preset: DatePeriodPreset) {
    const period = getDatePeriodPreset(preset, {
      minDate: dateRange?.minDate,
      maxDate: dateRange?.maxDate,
    });
    setPeriodStartDate(period.startDate);
    setPeriodEndDate(period.endDate);
  }

  return (
    <main className="min-h-screen">
      <header className="w-full border-b border-brand-100 bg-white/95 shadow-soft backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
              Painel institucional
            </p>
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
        <nav aria-label="Trilha de navegação" className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-600">
          {isHomePage ? (
            <span className="font-semibold text-surface-900" aria-current="page">Início</span>
          ) : (
            <NavLink to="/" className="font-medium transition hover:text-brand-700">Início</NavLink>
          )}
          {activeTab === 'settings' ? (
            <>
              <span aria-hidden="true" className="text-brand-300">/</span>
              <span className="font-semibold text-surface-900" aria-current="page">
                Configurações
              </span>
            </>
          ) : activeTab === 'kartado' ? (
            <>
              <span aria-hidden="true" className="text-brand-300">/</span>
              <span className="font-semibold text-surface-900" aria-current="page">
                Kartado
              </span>
            </>
          ) : activeTab ? (
            <>
              <span aria-hidden="true" className="text-brand-300">/</span>
              <NavLink to={DASHBOARD_ROUTES.storage} className="font-medium text-surface-700 transition hover:text-brand-700">
                ProjectWise
              </NavLink>
              <span aria-hidden="true" className="text-brand-300">/</span>
              <span className="font-semibold text-surface-900" aria-current="page">
                {DASHBOARD_TAB_LABELS[activeTab]}
              </span>
            </>
          ) : null}
        </nav>

        {isProjectWisePage ? (
        <nav aria-label="Navegação do ProjectWise" className="mt-4 flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2 shadow-soft">
          <NavLink
            to={DASHBOARD_ROUTES.storage}
            className={({ isActive }) => `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Armazenamento
          </NavLink>
          <NavLink
            to={DASHBOARD_ROUTES.projectWiseUsers}
            className={({ isActive }) => `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Usuários PW
          </NavLink>
          <NavLink
            to={DASHBOARD_ROUTES.tickets}
            className={({ isActive }) => `rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Chamados
          </NavLink>
        </nav>
        ) : null}

        {isHomePage ? <EngineeringSystemsHomePage /> : null}

        {activeTab === 'kartado' ? <KartadoPage /> : null}

        {activeTab === 'storage' ? (
          <>
            {profile?.role === 'admin' ? (
            <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte de armazenamento
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoStorageStatus.state === 'loading'
                      ? 'Atualizando a leitura no Supabase...'
                      : autoStorageStatus.state === 'ready'
                        ? `Fonte carregada: ${autoStorageStatus.fileName} ?s ${autoStorageStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoStorageStatus.rowsCount} registros lidos.`
                        : autoStorageStatus.state === 'missing'
                          ? 'Configure o Supabase ou mantenha uma fonte Excel em public/dados/armazenamento.xlsx.'
                          : autoStorageStatus.state === 'error'
                            ? autoStorageStatus.message
                            : 'O painel vai tentar carregar os dados de armazenamento automaticamente.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadAutoStorageSource({ syncBeforeRead: true })}
                    disabled={autoStorageStatus.state === 'loading'}
                    className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {autoStorageStatus.state === 'loading'
                      ? 'Atualizando...'
                      : 'Atualizar dados'}
                  </button>
                </div>
              </div>

              {profile?.role === 'admin' ? (
                <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <label className="block flex-1">
                      <span className="text-sm font-semibold text-surface-700">
                        Importar CSV diário
                      </span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        multiple
                        onChange={(event) => {
                          setStorageCsvFiles(Array.from(event.target.files ?? []));
                          setStorageCsvImportStatus({ state: 'idle' });
                        }}
                        className="mt-2 w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm text-surface-700 file:mr-4 file:rounded-xl file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void importSelectedStorageCsv()}
                      disabled={
                        storageCsvFiles.length === 0 ||
                        storageCsvImportStatus.state === 'importing'
                      }
                      className="inline-flex items-center justify-center rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {storageCsvImportStatus.state === 'importing'
                        ? 'Importando...'
                        : storageCsvFiles.length > 1
                          ? 'Importar CSVs'
                          : 'Importar CSV'}
                    </button>
                  </div>

                  {storageCsvFiles.length > 0 ? (
                    <p className="mt-3 text-xs text-surface-700">
                      {storageCsvFiles.length} arquivo(s) selecionado(s).
                    </p>
                  ) : null}

                  {storageCsvImportStatus.state === 'success' ||
                  storageCsvImportStatus.state === 'error' ? (
                    <p
                      className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                        storageCsvImportStatus.state === 'error'
                          ? 'border-red-100 bg-red-50 text-red-700'
                          : 'border-brand-100 bg-white text-brand-700'
                      }`}
                    >
                      {storageCsvImportStatus.message}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <SourceUpdateProgress
                active={autoStorageStatus.state === 'loading'}
                steps={STORAGE_UPDATE_STEPS}
              />

              {autoStorageStatus.state === 'ready' && autoStorageStatus.syncInfo ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-surface-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Sincronização
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoStorageStatus.syncInfo.syncedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Fonte alterada
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoStorageStatus.syncInfo.sourceModifiedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Linhas fonte/cópia
                    </p>
                    <p className="mt-1">
                      {autoStorageStatus.syncInfo.sourceRowsCount} /{' '}
                      {autoStorageStatus.syncInfo.destinationRowsCount}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Tamanho
                    </p>
                    <p className="mt-1">
                      {formatBytes(autoStorageStatus.syncInfo.destinationSize)} bytes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Assinatura
                    </p>
                    <p
                      className="mt-1"
                      title={autoStorageStatus.syncInfo.destinationHash}
                    >
                      {formatShortHash(autoStorageStatus.syncInfo.destinationHash)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Destino
                    </p>
                    <p className="mt-1 truncate" title={autoStorageStatus.syncInfo.destinationPath}>
                      {autoStorageStatus.syncInfo.destinationPath}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
            ) : null}

            <section className="mt-6">
              <PeriodFilter
                endDate={periodEndDate}
                filteredRowsCount={filteredRows.length}
                isLatestAvailableMonth={isUsingLatestStorageMonth}
                maxDate={dateRange?.maxDate}
                minDate={dateRange?.minDate}
                onEndDateChange={setPeriodEndDate}
                onPresetChange={applyPeriodPreset}
                onStartDateChange={setPeriodStartDate}
                startDate={periodStartDate}
                totalRowsCount={rows.length}
              />
            </section>

            <section className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <LastUpdateCard latestUpdate={latestUpdate} />
              <TotalCapacityCard totalCapacity={totalCapacity} />
              <UsedSpaceCard usedSpace={usedSpace} />
              <FreeSpaceCard freeSpace={freeSpace} />
              <UsagePercentageCard usagePercentage={usagePercentage} />
              <PeriodVariationCard periodVariation={periodVariation} />
              <AverageGrowthRateCard averageGrowthRate={averageGrowthRate} />
              <TwelveMonthForecastCard forecast={twelveMonthForecast} />
            </section>
          </>
        ) : null}

        {activeTab === 'projectWiseUsers' ? (
          <>
            {profile?.role === 'admin' ? (
            <>
            <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte E365 Usage Data
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoProjectWiseUsersStatus.state === 'loading'
                      ? 'Atualizando os dados de uso e faturamento E365...'
                      : autoProjectWiseUsersStatus.state === 'ready'
                        ? `Fonte carregada: ${autoProjectWiseUsersStatus.fileName} ?s ${autoProjectWiseUsersStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoProjectWiseUsersStatus.rowsCount} registros lidos.`
                        : autoProjectWiseUsersStatus.state === 'missing'
                          ? 'Importe o relatório E365 Usage Data.'
                          : autoProjectWiseUsersStatus.state === 'error'
                            ? autoProjectWiseUsersStatus.message
                            : 'O painel vai carregar os dados E365 armazenados no banco.'}
                  </p>
                </div>

                {profile?.role === 'admin' ? (
                  <div className="flex flex-col gap-3 sm:min-w-[360px]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                      Arquivo E365 Usage Data
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(event) => {
                          setProjectWiseExplorerFile(event.target.files?.[0] ?? null);
                          setProjectWiseExplorerImportStatus({ state: 'idle' });
                        }}
                        className="rounded-2xl border border-brand-100 bg-brand-50/40 px-3 py-2 text-sm text-surface-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void importSelectedProjectWiseExplorerFile()}
                      disabled={
                        !projectWiseExplorerFile ||
                        projectWiseExplorerImportStatus.state === 'importing'
                      }
                      className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {projectWiseExplorerImportStatus.state === 'importing'
                        ? 'Importando...'
                        : 'Importar E365'}
                    </button>
                    {e365UsageRows.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void clearLatestE365Quarter()}
                        disabled={projectWiseExplorerImportStatus.state === 'importing'}
                        className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Limpar {formatE365Quarter(getLatestE365Quarter(e365UsageRows))}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <SourceUpdateProgress
                active={
                  autoProjectWiseUsersStatus.state === 'loading' ||
                  projectWiseExplorerImportStatus.state === 'importing'
                }
                steps={PROJECT_WISE_USERS_UPDATE_STEPS}
              />

              {projectWiseExplorerImportStatus.state === 'success' ||
              projectWiseExplorerImportStatus.state === 'error' ? (
                <p
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    projectWiseExplorerImportStatus.state === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {projectWiseExplorerImportStatus.message}
                </p>
              ) : null}

              {autoProjectWiseUsersStatus.state === 'ready' &&
              autoProjectWiseUsersStatus.syncInfo ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-surface-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Sincronização
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoProjectWiseUsersStatus.syncInfo.syncedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Linhas fonte/cópia
                    </p>
                    <p className="mt-1">
                      {autoProjectWiseUsersStatus.syncInfo.sourceRowsCount} /{' '}
                      {autoProjectWiseUsersStatus.syncInfo.destinationRowsCount}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Tamanho
                    </p>
                    <p className="mt-1">
                      {formatBytes(autoProjectWiseUsersStatus.syncInfo.destinationSize)} bytes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Assinatura
                    </p>
                    <p
                      className="mt-1"
                      title={autoProjectWiseUsersStatus.syncInfo.destinationHash}
                    >
                      {formatShortHash(autoProjectWiseUsersStatus.syncInfo.destinationHash)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Destino
                    </p>
                    <p
                      className="mt-1 truncate"
                      title={autoProjectWiseUsersStatus.syncInfo.destinationPath}
                    >
                      {autoProjectWiseUsersStatus.syncInfo.destinationPath}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-4 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte Portal Bentley
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoProjectWisePortalUsersStatus.state === 'loading'
                      ? 'Atualizando a leitura do CSV exportado do Portal Bentley...'
                      : autoProjectWisePortalUsersStatus.state === 'ready'
                        ? `Fonte carregada: ${autoProjectWisePortalUsersStatus.fileName} ?s ${autoProjectWisePortalUsersStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoProjectWisePortalUsersStatus.rowsCount} registros lidos.`
                        : autoProjectWisePortalUsersStatus.state === 'missing'
                          ? 'Configure PORTAL_USERS_SOURCE_PATH no .env.local ou coloque o Excel em public/dados/usuarios-pw-portal.xlsx.'
                          : autoProjectWisePortalUsersStatus.state === 'error'
                            ? autoProjectWisePortalUsersStatus.message
                            : 'O painel vai tentar carregar a planilha do Portal Bentley automaticamente.'}
                  </p>
                </div>

                {profile?.role === 'admin' ? (
                  <div className="flex flex-col gap-3 sm:min-w-[360px]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                      Arquivo Portal Bentley
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(event) => {
                          setProjectWisePortalFile(event.target.files?.[0] ?? null);
                          setProjectWisePortalImportStatus({ state: 'idle' });
                        }}
                        className="rounded-2xl border border-brand-100 bg-brand-50/40 px-3 py-2 text-sm text-surface-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void importSelectedProjectWisePortalFile()}
                      disabled={
                        !projectWisePortalFile ||
                        projectWisePortalImportStatus.state === 'importing'
                      }
                      className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {projectWisePortalImportStatus.state === 'importing'
                        ? 'Importando...'
                        : 'Importar Portal'}
                    </button>
                  </div>
                ) : null}
              </div>

              <SourceUpdateProgress
                active={
                  autoProjectWisePortalUsersStatus.state === 'loading' ||
                  projectWisePortalImportStatus.state === 'importing'
                }
                steps={PORTAL_USERS_UPDATE_STEPS}
              />

              {projectWisePortalImportStatus.state === 'success' ||
              projectWisePortalImportStatus.state === 'error' ? (
                <p
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    projectWisePortalImportStatus.state === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {projectWisePortalImportStatus.message}
                </p>
              ) : null}

              {autoProjectWisePortalUsersStatus.state === 'ready' &&
              autoProjectWisePortalUsersStatus.syncInfo ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-surface-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Sincronização
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoProjectWisePortalUsersStatus.syncInfo.syncedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Fonte alterada
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(
                        autoProjectWisePortalUsersStatus.syncInfo.sourceModifiedAt,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Linhas fonte/cópia
                    </p>
                    <p className="mt-1">
                      {autoProjectWisePortalUsersStatus.syncInfo.sourceRowsCount} /{' '}
                      {autoProjectWisePortalUsersStatus.syncInfo.destinationRowsCount}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Tamanho
                    </p>
                    <p className="mt-1">
                      {formatBytes(autoProjectWisePortalUsersStatus.syncInfo.destinationSize)} bytes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Assinatura
                    </p>
                    <p
                      className="mt-1"
                      title={autoProjectWisePortalUsersStatus.syncInfo.destinationHash}
                    >
                      {formatShortHash(autoProjectWisePortalUsersStatus.syncInfo.destinationHash)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Destino
                    </p>
                    <p
                      className="mt-1 truncate"
                      title={autoProjectWisePortalUsersStatus.syncInfo.destinationPath}
                    >
                      {autoProjectWisePortalUsersStatus.syncInfo.destinationPath}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
            </>
            ) : null}

            <section className="mt-6">
              <ProjectWiseUsersTab
                canManage={IS_E365_LOCAL_PREVIEW || profile?.role === 'admin'}
                e365Rows={e365UsageRows}
                isLocalPreview={IS_E365_LOCAL_PREVIEW}
                onImportE365Files={importE365Files}
                webRows={projectWiseWebUserRows}
              />
            </section>
          </>
        ) : null}

        {activeTab === 'tickets' ? (
          <>
            {profile?.role === 'admin' ? (
              <section
                id="ticket-form"
                className="mt-6 scroll-mt-24 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Registro de chamados
                  </p>
                  <p className="text-sm text-surface-700">
                    Cadastre e mantenha os chamados que alimentam os indicadores da aba.
                  </p>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Caso
                    <input
                      value={ticketForm.caseNumber ?? ''}
                      onChange={(event) => updateTicketForm('caseNumber', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Status
                    <select
                      value={ticketForm.status}
                      onChange={(event) => updateTicketForm('status', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    >
                      <option>Novo</option>
                      <option>Na fila</option>
                      <option>Pendente</option>
                      <option>Em andamento</option>
                      <option>Resolvido</option>
                      <option>Fechado</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Aberto em
                    <input
                      type="datetime-local"
                      value={ticketForm.openedAt}
                      onChange={(event) => updateTicketForm('openedAt', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Fechado em
                    <input
                      type="datetime-local"
                      value={ticketForm.closedAt ?? ''}
                      onChange={(event) => updateTicketForm('closedAt', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Motivo
                    <input
                      value={ticketForm.reason ?? ''}
                      onChange={(event) => updateTicketForm('reason', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Prioridade
                    <select
                      value={ticketForm.priority ?? ''}
                      onChange={(event) => updateTicketForm('priority', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Não informado</option>
                      <option>Alta</option>
                      <option>Média</option>
                      <option>Baixa</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Solicitante
                    <input
                      list="ticket-requester-history"
                      value={ticketForm.requester ?? ''}
                      onChange={(event) => updateTicketForm('requester', event.target.value)}
                      placeholder="Digite ou selecione do histórico"
                      autoComplete="off"
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                    <datalist id="ticket-requester-history">
                      {requesterHistory.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.count} chamado{item.count === 1 ? '' : 's'}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Organização
                    <input
                      list="ticket-organization-history"
                      value={ticketForm.beneficiaryOrganization ?? ''}
                      onChange={(event) =>
                        updateTicketForm('beneficiaryOrganization', event.target.value)
                      }
                      placeholder="Digite ou selecione do histórico"
                      autoComplete="off"
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                    <datalist id="ticket-organization-history">
                      {organizationHistory.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.requesterMatches > 0
                            ? `Usada anteriormente para este solicitante`
                            : `${item.count} chamado${item.count === 1 ? '' : 's'}`}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Tipo de ticket
                    <select
                      value={ticketForm.ticketType ?? ''}
                      onChange={(event) => updateTicketForm('ticketType', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Não informado</option>
                      <option>Solicitação de serviço</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Status do SLA
                    <select
                      value={ticketForm.slaStatus ?? ''}
                      onChange={(event) => updateTicketForm('slaStatus', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Não informado</option>
                      <option>No SLA</option>
                      <option>SLA violado</option>
                      <option>Não aplicado</option>
                    </select>
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveTicketForm()}
                    disabled={ticketFormStatus.state === 'saving'}
                    className="rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ticketFormStatus.state === 'saving'
                      ? 'Salvando...'
                      : ticketForm.id
                        ? 'Atualizar chamado'
                        : 'Registrar chamado'}
                  </button>
                  <button
                    type="button"
                    onClick={resetTicketForm}
                    className="rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    Limpar
                  </button>
                </div>

                {ticketFormStatus.state === 'success' || ticketFormStatus.state === 'error' ? (
                  <p
                    className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                      ticketFormStatus.state === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {ticketFormStatus.message}
                  </p>
                ) : null}

              </section>
            ) : null}

            <section className="mt-6">
              <TicketsTab rows={ticketRows} />
            </section>

            {profile?.role === 'admin' ? (
              <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Lista de chamados
                  </p>
                  <p className="text-sm text-surface-700">
                    Consulte, filtre e gerencie os chamados já cadastrados.
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                      Pesquisar chamado
                      <input
                        type="search"
                        value={ticketSearchTerm}
                        onChange={(event) => setTicketSearchTerm(event.target.value)}
                        placeholder="Caso, solicitante, status, motivo ou tipo"
                        className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={clearTicketFilters}
                      disabled={!hasTicketFilters}
                      className="h-11 rounded-2xl border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Limpar filtros
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
                      Caso
                      <input
                        type="search"
                        value={ticketColumnFilters.caseNumber}
                        onChange={(event) =>
                          setTicketColumnFilters((current) => ({
                            ...current,
                            caseNumber: event.target.value,
                          }))
                        }
                        placeholder="Filtrar caso"
                        className="h-10 rounded-xl border border-brand-100 bg-white px-3 text-sm font-medium normal-case tracking-normal text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
                      Status
                      <select
                        value={ticketColumnFilters.status}
                        onChange={(event) =>
                          setTicketColumnFilters((current) => ({
                            ...current,
                            status: event.target.value,
                          }))
                        }
                        className="h-10 rounded-xl border border-brand-100 bg-white px-3 text-sm font-medium normal-case tracking-normal text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      >
                        <option value="">Todos</option>
                        {ticketStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
                      Solicitante
                      <input
                        type="search"
                        value={ticketColumnFilters.requester}
                        onChange={(event) =>
                          setTicketColumnFilters((current) => ({
                            ...current,
                            requester: event.target.value,
                          }))
                        }
                        placeholder="Filtrar solicitante"
                        className="h-10 rounded-xl border border-brand-100 bg-white px-3 text-sm font-medium normal-case tracking-normal text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-surface-700">
                    {filteredAdminTicketRows.length} de {ticketRows.length} chamados encontrados.
                  </p>
                </div>

                <div className="mt-3 overflow-auto rounded-2xl border border-brand-100">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-brand-50 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                      <tr>
                        <th className="px-4 py-3">Caso</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Solicitante</th>
                        <th className="px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-50">
                      {paginatedAdminTicketRows.map((row, index) => (
                        <tr key={`${row.__id ?? getTicketCaseNumber(row)}-${index}`}>
                          <td className="px-4 py-3 font-medium text-surface-900">
                            {getTicketCaseNumber(row) || '-'}
                          </td>
                          <td className="px-4 py-3 text-surface-700">{row.Status || '-'}</td>
                          <td className="px-4 py-3 text-surface-700">{row.Solicitante || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => editTicket(row)}
                                className="rounded-xl border border-brand-100 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeTicket(row)}
                                className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredAdminTicketRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-sm text-surface-700" colSpan={4}>
                            Nenhum chamado encontrado.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-surface-700 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Exibindo {firstTicketOnPage}-{lastTicketOnPage} de{' '}
                    {filteredAdminTicketRows.length} chamados
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTicketPage(Math.max(1, visibleTicketPage - 1))}
                      disabled={visibleTicketPage === 1}
                      className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Anterior
                    </button>
                    <span className="min-w-[88px] text-center text-xs font-semibold text-surface-700">
                      Página {visibleTicketPage} de {totalTicketPages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setTicketPage(Math.min(totalTicketPages, visibleTicketPage + 1))
                      }
                      disabled={visibleTicketPage === totalTicketPages}
                      className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {profile?.role === 'admin' && !hasSupabaseTicketsConfig() ? (
            <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte de chamados
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoTicketsStatus.state === 'loading'
                      ? 'Atualizando a leitura da planilha de chamados...'
                      : autoTicketsStatus.state === 'ready'
                        ? `Fonte carregada: ${autoTicketsStatus.fileName} ?s ${autoTicketsStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoTicketsStatus.rowsCount} registros lidos.`
                        : autoTicketsStatus.state === 'missing'
                          ? 'Coloque a planilha de chamados em public/dados/chamados.xlsx.'
                          : autoTicketsStatus.state === 'error'
                            ? autoTicketsStatus.message
                            : 'O painel vai tentar carregar a planilha de chamados automaticamente.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadAutoTicketsSource({ syncBeforeRead: true })}
                  disabled={autoTicketsStatus.state === 'loading'}
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoTicketsStatus.state === 'loading' ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>

              <SourceUpdateProgress
                active={autoTicketsStatus.state === 'loading'}
                steps={TICKETS_UPDATE_STEPS}
              />

              {autoTicketsStatus.state === 'ready' && autoTicketsStatus.syncInfo ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-surface-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Sincronização
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoTicketsStatus.syncInfo.syncedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Fonte alterada
                    </p>
                    <p className="mt-1">
                      {formatTechnicalDate(autoTicketsStatus.syncInfo.sourceModifiedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Linhas fonte/cópia
                    </p>
                    <p className="mt-1">
                      {autoTicketsStatus.syncInfo.sourceRowsCount} /{' '}
                      {autoTicketsStatus.syncInfo.destinationRowsCount}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Tamanho
                    </p>
                    <p className="mt-1">
                      {formatBytes(autoTicketsStatus.syncInfo.destinationSize)} bytes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Assinatura
                    </p>
                    <p className="mt-1" title={autoTicketsStatus.syncInfo.destinationHash}>
                      {formatShortHash(autoTicketsStatus.syncInfo.destinationHash)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Destino
                    </p>
                    <p className="mt-1 truncate" title={autoTicketsStatus.syncInfo.destinationPath}>
                      {autoTicketsStatus.syncInfo.destinationPath}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
            ) : null}

          </>
        ) : null}

        {activeTab === 'settings' ? <UserSettingsPage /> : null}
      </div>
    </main>
  );
}

