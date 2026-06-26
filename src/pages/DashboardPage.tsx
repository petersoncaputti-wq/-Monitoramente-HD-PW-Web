import { useEffect, useMemo, useState } from 'react';
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
import type {
  ImportedWorkbookData,
  MonitoringRow,
  ProjectWiseUserRow,
  ProjectWiseWebUserRow,
  TicketRow,
} from '@/types/monitoring';
import { readMonitoringWorkbookFromUrl } from '@/services/excelService';
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

type DashboardTab = 'storage' | 'projectWiseUsers' | 'tickets';

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

const AUTO_PROJECT_WISE_USER_SOURCES = [
  'dados/usuarios-pw-explorer.xlsx',
  'dados/usuarios-pw-explorer.xls',
  'dados/usuarios-pw-explorer.csv',
];

const AUTO_PROJECT_WISE_PORTAL_USER_SOURCES = [
  'dados/usuarios-pw-portal.xlsx',
  'dados/usuarios-pw-portal.xls',
  'dados/usuarios-pw-portal.csv',
];

const EXTERNAL_STORAGE_SOURCE_URL = import.meta.env.VITE_STORAGE_SOURCE_URL?.trim();

const STORAGE_UPDATE_STEPS = [
  'Lendo arquivo sincronizado no OneDrive',
  'Copiando fonte para a pasta publica',
  'Validando linhas da planilha',
  'Recarregando indicadores de armazenamento',
];

const TICKETS_UPDATE_STEPS = [
  'Lendo planilha de chamados no OneDrive',
  'Copiando fonte para a pasta publica',
  'Validando linhas da planilha',
  'Recarregando indicadores de chamados',
];

const PROJECT_WISE_USERS_UPDATE_STEPS = [
  'Conectando ao ProjectWise',
  'Consultando usuários do PW Explorer',
  'Consultando registros de acesso no Audit Trail',
  'Aplicando regras de inatividade e excecoes',
  'Gerando planilha Excel',
  'Recarregando indicadores de usuários',
];

const PORTAL_USERS_UPDATE_STEPS = [
  'Lendo arquivo do PW Web no OneDrive',
  'Copiando fonte para a pasta publica',
  'Normalizando cabeçalhos do Portal Bentley',
  'Recarregando comparativo de usuários',
];

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

async function syncLocalProjectWiseUsersSource(): Promise<StorageSyncInfo | undefined> {
  const response = await fetch('/api/sync-pw-users', {
    method: 'POST',
  });

  if (response.status === 404) {
    return undefined;
  }

  const result = (await response.json().catch(() => null)) as StorageSyncResponse | null;

  if (!response.ok) {
    throw new Error(result?.error ?? 'Não foi possível atualizar a fonte de usuários PW.');
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

function isProjectWiseUserRow(
  row: ImportedWorkbookData['rows'][number],
): row is ProjectWiseUserRow {
  return 'Ultimoacesso' in row && 'StatusProjectWise' in row && 'Elegivelexclusao' in row;
}

function isProjectWiseWebUserRow(
  row: ImportedWorkbookData['rows'][number],
): row is ProjectWiseWebUserRow {
  return 'Email' in row && 'LastLoginDate' in row && 'Locked' in row;
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('storage');
  const [storageData, setStorageData] = useState<ImportedWorkbookData | null>(null);
  const [ticketsData, setTicketsData] = useState<ImportedWorkbookData | null>(null);
  const [projectWiseUsersData, setProjectWiseUsersData] =
    useState<ImportedWorkbookData | null>(null);
  const [projectWisePortalUsersData, setProjectWisePortalUsersData] =
    useState<ImportedWorkbookData | null>(null);
  const [autoStorageStatus, setAutoStorageStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoTicketsStatus, setAutoTicketsStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoProjectWiseUsersStatus, setAutoProjectWiseUsersStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [autoProjectWisePortalUsersStatus, setAutoProjectWisePortalUsersStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const rows = useMemo(
    () => (storageData?.rows.filter(isMonitoringRow) ?? []),
    [storageData],
  );
  const projectWiseUserRows = useMemo(
    () => projectWiseUsersData?.rows.filter(isProjectWiseUserRow) ?? [],
    [projectWiseUsersData],
  );
  const projectWiseWebUserRows = useMemo(
    () => projectWisePortalUsersData?.rows.filter(isProjectWiseWebUserRow) ?? [],
    [projectWisePortalUsersData],
  );
  const ticketRows = useMemo(
    () => (ticketsData?.rows.filter(isTicketRow) ?? []),
    [ticketsData],
  );
  const dateRange = useMemo(() => getRowsDateRange(rows), [rows]);
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
      setActiveTab('storage');
    }

    setPeriodStartDate(range?.minDate ?? '');
    setPeriodEndDate(range?.maxDate ?? '');
  }

  function applyTicketsData(data: ImportedWorkbookData) {
    setTicketsData(data);
  }

  function applyProjectWiseUsersData(data: ImportedWorkbookData) {
    setProjectWiseUsersData(data);
  }

  function applyProjectWisePortalUsersData(data: ImportedWorkbookData) {
    setProjectWisePortalUsersData(data);
  }

  async function loadAutoStorageSource(options?: { syncBeforeRead?: boolean }) {
    setAutoStorageStatus({ state: 'loading' });

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

  async function loadAutoTicketsSource(options?: { syncBeforeRead?: boolean }) {
    setAutoTicketsStatus({ state: 'loading' });

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

  async function loadAutoProjectWiseUsersSource(options?: { syncBeforeRead?: boolean }) {
    setAutoProjectWiseUsersStatus({ state: 'loading' });

    let lastError: unknown = null;
    let syncInfo: StorageSyncInfo | undefined;
    const localCacheKey = String(Date.now());

    if (options?.syncBeforeRead) {
      try {
        syncInfo = await syncLocalProjectWiseUsersSource();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a fonte de usuários PW.';

        setAutoProjectWiseUsersStatus({ state: 'error', message });
        return;
      }
    }

    for (const source of AUTO_PROJECT_WISE_USER_SOURCES.map((userSource) => ({
      fileName: userSource,
      url: getPublicUrl(userSource, localCacheKey),
    }))) {
      try {
        const data = await readMonitoringWorkbookFromUrl(source.url, source.fileName);

        if (data.kind !== 'projectWiseUsers') {
          throw new Error('A fonte encontrada não possui os cabeçalhos de usuários PW.');
        }

        applyProjectWiseUsersData(data);
        setAutoProjectWiseUsersStatus({
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
        : 'Não foi possível carregar a fonte automática de usuários PW.';

    setAutoProjectWiseUsersStatus(
      hasHeaderError(message) ? { state: 'error', message } : { state: 'missing' },
    );
  }

  async function loadAutoProjectWisePortalUsersSource(options?: { syncBeforeRead?: boolean }) {
    setAutoProjectWisePortalUsersStatus({ state: 'loading' });

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
    void loadAutoStorageSource();
    void loadAutoTicketsSource();
    void loadAutoProjectWiseUsersSource();
    void loadAutoProjectWisePortalUsersSource();
  }, []);

  function clearPeriodFilter() {
    setPeriodStartDate(dateRange?.minDate ?? '');
    setPeriodEndDate(dateRange?.maxDate ?? '');
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
              Painel Operacional ProjectWise
            </h1>
          </div>

          <div className="flex shrink-0 items-center rounded-[20px] bg-white px-2 py-2">
            <img
              src="/images/ecorodovias-logo.png"
              alt="Logo Ecorodovias"
              className="h-auto w-full max-w-[220px] object-contain"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mt-2 flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2 shadow-soft">
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'storage'
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Armazenamento
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('projectWiseUsers')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'projectWiseUsers'
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Usuários PW
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'tickets'
                ? 'bg-brand-700 text-white shadow-soft'
                : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            Chamados
          </button>
        </nav>

        {activeTab === 'storage' ? (
          <>
            <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte de armazenamento
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoStorageStatus.state === 'loading'
                      ? 'Atualizando a leitura da planilha padrão...'
                      : autoStorageStatus.state === 'ready'
                        ? `Fonte carregada: ${autoStorageStatus.fileName} as ${autoStorageStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoStorageStatus.rowsCount} registros lidos.`
                        : autoStorageStatus.state === 'missing'
                          ? 'Configure VITE_STORAGE_SOURCE_URL ou coloque o Excel diario em public/dados/armazenamento.xlsx.'
                          : autoStorageStatus.state === 'error'
                            ? autoStorageStatus.message
                            : 'O painel vai tentar carregar a planilha padrão automaticamente.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadAutoStorageSource({ syncBeforeRead: true })}
                  disabled={autoStorageStatus.state === 'loading'}
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoStorageStatus.state === 'loading'
                    ? 'Atualizando...'
                    : 'Atualizar'}
                </button>
              </div>

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
                      Linhas fonte/copia
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

            <section className="mt-6">
              <PeriodFilter
                endDate={periodEndDate}
                filteredRowsCount={filteredRows.length}
                maxDate={dateRange?.maxDate}
                minDate={dateRange?.minDate}
                onClear={clearPeriodFilter}
                onEndDateChange={setPeriodEndDate}
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
            <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Fonte de usuários PW
                  </p>
                  <p className="mt-2 text-sm text-surface-700">
                    {autoProjectWiseUsersStatus.state === 'loading'
                      ? 'Atualizando a extração de usuários ProjectWise...'
                      : autoProjectWiseUsersStatus.state === 'ready'
                        ? `Fonte carregada: ${autoProjectWiseUsersStatus.fileName} as ${autoProjectWiseUsersStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoProjectWiseUsersStatus.rowsCount} registros lidos.`
                        : autoProjectWiseUsersStatus.state === 'missing'
                          ? 'Atualize a fonte para gerar public/dados/usuarios-pw-explorer.xlsx.'
                          : autoProjectWiseUsersStatus.state === 'error'
                            ? autoProjectWiseUsersStatus.message
                            : 'O painel vai tentar carregar a planilha de usuários PW automaticamente.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadAutoProjectWiseUsersSource({ syncBeforeRead: true })}
                  disabled={autoProjectWiseUsersStatus.state === 'loading'}
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoProjectWiseUsersStatus.state === 'loading'
                    ? 'Atualizando...'
                    : 'Atualizar'}
                </button>
              </div>

              <SourceUpdateProgress
                active={autoProjectWiseUsersStatus.state === 'loading'}
                steps={PROJECT_WISE_USERS_UPDATE_STEPS}
              />

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
                      Linhas fonte/copia
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
                        ? `Fonte carregada: ${autoProjectWisePortalUsersStatus.fileName} as ${autoProjectWisePortalUsersStatus.loadedAt.toLocaleTimeString('pt-BR', {
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

                <button
                  type="button"
                  onClick={() =>
                    void loadAutoProjectWisePortalUsersSource({ syncBeforeRead: true })
                  }
                  disabled={autoProjectWisePortalUsersStatus.state === 'loading'}
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoProjectWisePortalUsersStatus.state === 'loading'
                    ? 'Atualizando...'
                    : 'Atualizar'}
                </button>
              </div>

              <SourceUpdateProgress
                active={autoProjectWisePortalUsersStatus.state === 'loading'}
                steps={PORTAL_USERS_UPDATE_STEPS}
              />

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
                      Linhas fonte/copia
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

            <section className="mt-6">
              <ProjectWiseUsersTab
                explorerRows={projectWiseUserRows}
                webRows={projectWiseWebUserRows}
              />
            </section>
          </>
        ) : null}

        {activeTab === 'tickets' ? (
          <>
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
                        ? `Fonte carregada: ${autoTicketsStatus.fileName} as ${autoTicketsStatus.loadedAt.toLocaleTimeString('pt-BR', {
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
                      Linhas fonte/copia
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

            <section className="mt-6">
              <TicketsTab rows={ticketRows} />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
