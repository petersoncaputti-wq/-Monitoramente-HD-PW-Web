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
import { useAuth } from '@/contexts/AuthContext';
import { UserSettingsPage } from '@/pages/UserSettingsPage';
import type {
  ImportedWorkbookData,
  MonitoringRow,
  ProjectWiseUserRow,
  ProjectWiseWebUserRow,
  TicketRow,
} from '@/types/monitoring';
import { readMonitoringWorkbookFromUrl } from '@/services/excelService';
import { importProjectWiseUsersFile } from '@/services/projectWiseUsersImportService';
import {
  hasSupabaseProjectWiseUsersConfig,
  readProjectWiseExplorerUsersFromSupabase,
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

type DashboardTab = 'storage' | 'projectWiseUsers' | 'tickets' | 'settings';

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
  const { accessToken, getValidAccessToken, logout, profile } = useAuth();
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
    summary: '',
  });
  const [ticketFormStatus, setTicketFormStatus] = useState<TicketFormStatus>({ state: 'idle' });
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
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
    getTicketValue(row, 'Cason') || getTicketValue(row, 'Caso n') || String(row['Cason.Âº'] ?? '');
  const filteredAdminTicketRows = useMemo(() => {
    const normalizedTerm = ticketSearchTerm
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (!normalizedTerm) {
      return ticketRows;
    }

    return ticketRows.filter((row) =>
      [
        getTicketCaseNumber(row),
        row.Status,
        row.Resumo,
        row.Solicitante,
        row.Motivo,
        row.Tipodeticket,
        row.StatusdoSLA,
      ].some((value) =>
        String(value ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(normalizedTerm),
      ),
    );
  }, [ticketRows, ticketSearchTerm]);
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

    if (hasSupabaseStorageConfig()) {
      if (!accessToken) {
        setAutoStorageStatus({
          state: 'error',
          message: 'Sessao autenticada indisponivel para ler os dados de armazenamento.',
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
            : 'Nao foi possivel carregar os dados de armazenamento no Supabase.';

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
        throw new Error('Sessao expirada. Entre novamente para importar os arquivos.');
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
            : 'Nao foi possivel importar o CSV de armazenamento.',
      });
    }
  }

  async function importSelectedProjectWiseExplorerFile() {
    if (!accessToken || !projectWiseExplorerFile) {
      return;
    }

    setProjectWiseExplorerImportStatus({ state: 'importing' });

    try {
      const validAccessToken = await getValidAccessToken();

      if (!validAccessToken) {
        throw new Error('Sessao expirada. Entre novamente para importar o arquivo.');
      }

      const result = await importProjectWiseUsersFile(
        validAccessToken,
        'explorer',
        projectWiseExplorerFile,
      );

      setProjectWiseExplorerImportStatus({
        state: 'success',
        message: `${result.rowsRead} linhas lidas e ${result.rowsImported} usuarios PW importados.`,
      });
      setProjectWiseExplorerFile(null);
      await loadAutoProjectWiseUsersSource();
    } catch (error) {
      setProjectWiseExplorerImportStatus({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel importar os usuarios PW.',
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
        throw new Error('Sessao expirada. Entre novamente para importar o arquivo.');
      }

      const result = await importProjectWiseUsersFile(
        validAccessToken,
        'portal',
        projectWisePortalFile,
      );

      setProjectWisePortalImportStatus({
        state: 'success',
        message: `${result.rowsRead} linhas lidas e ${result.rowsImported} usuarios do Portal importados.`,
      });
      setProjectWisePortalFile(null);
      await loadAutoProjectWisePortalUsersSource();
    } catch (error) {
      setProjectWisePortalImportStatus({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel importar os usuarios do Portal Bentley.',
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
      summary: '',
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
      beneficiaryOrganization: getValue('Organizacaobeneficiario'),
      caseNumber: getValue('Cason'),
      closedAt: toDatetimeLocal(row.Fechadoem),
      id,
      openedAt: toDatetimeLocal(row.Abertoem),
      priority: String(row.Prioridade ?? ''),
      reason: String(row.Motivo ?? ''),
      requestedFor: String(row.Solicitadopara ?? ''),
      requester: String(row.Solicitante ?? ''),
      requesterOrganization: getValue('Organizacaodosolicitante'),
      slaStatus: String(row.StatusdoSLA ?? ''),
      status: String(row.Status ?? 'Novo'),
      summary: String(row.Resumo ?? ''),
      ticketType: String(row.Tipodeticket ?? ''),
      updatedAt: toDatetimeLocal(row.Atualizado),
    });
    setTicketFormStatus({ state: 'idle' });
  }

  async function saveTicketForm() {
    const validAccessToken = await getValidAccessToken();

    if (!validAccessToken) {
      setTicketFormStatus({
        state: 'error',
        message: 'Sessao expirada. Entre novamente para salvar o chamado.',
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
      await loadAutoTicketsSource();
    } catch (error) {
      setTicketFormStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel salvar o chamado.',
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
        message: 'Sessao expirada. Entre novamente para excluir o chamado.',
      });
      return;
    }

    try {
      await deleteTicket(validAccessToken, id);
      setTicketFormStatus({ state: 'success', message: 'Chamado excluido.' });
      await loadAutoTicketsSource();
    } catch (error) {
      setTicketFormStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel excluir o chamado.',
      });
    }
  }

  async function loadAutoTicketsSource(options?: { syncBeforeRead?: boolean }) {
    setAutoTicketsStatus({ state: 'loading' });

    if (hasSupabaseTicketsConfig()) {
      if (!accessToken) {
        setAutoTicketsStatus({
          state: 'error',
          message: 'Sessao autenticada indisponivel para ler os chamados.',
        });
        return;
      }

      try {
        const data = await readTicketsFromSupabase(accessToken);

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
              : 'Nao foi possivel carregar os chamados no Supabase.',
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

  async function loadAutoProjectWiseUsersSource(options?: { syncBeforeRead?: boolean }) {
    setAutoProjectWiseUsersStatus({ state: 'loading' });

    if (hasSupabaseProjectWiseUsersConfig()) {
      if (!accessToken) {
        setAutoProjectWiseUsersStatus({
          state: 'error',
          message: 'Sessao autenticada indisponivel para ler os usuarios PW.',
        });
        return;
      }

      try {
        const data = await readProjectWiseExplorerUsersFromSupabase(accessToken);

        applyProjectWiseUsersData(data);
        setAutoProjectWiseUsersStatus({
          state: 'ready',
          fileName: data.fileName,
          loadedAt: new Date(),
          rowsCount: data.rows.length,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Nao foi possivel carregar os usuarios PW no Supabase.';

        setAutoProjectWiseUsersStatus({ state: 'error', message });
      }

      return;
    }

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

    if (hasSupabaseProjectWiseUsersConfig()) {
      if (!accessToken) {
        setAutoProjectWisePortalUsersStatus({
          state: 'error',
          message: 'Sessao autenticada indisponivel para ler os usuarios do Portal Bentley.',
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
            : 'Nao foi possivel carregar os usuarios do Portal Bentley no Supabase.';

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
    if (!hasSupabaseTicketsConfig()) {
      void loadAutoTicketsSource();
    }
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadAutoStorageSource();
    void loadAutoTicketsSource();
    void loadAutoProjectWiseUsersSource();
    void loadAutoProjectWisePortalUsersSource();
  }, [accessToken]);

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

          <div className="flex flex-col items-start gap-2 rounded-[20px] border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-surface-700 lg:items-end">
            <span className="font-semibold text-surface-900">{profile?.email}</span>
            <span className="text-xs uppercase tracking-[0.16em] text-brand-700">
              {profile?.role === 'admin' ? 'Administrador' : 'Usuario padrao'}
            </span>
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
          {profile?.role === 'admin' ? (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'settings'
                  ? 'bg-brand-700 text-white shadow-soft'
                  : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
              }`}
            >
              Configurações
            </button>
          ) : null}
        </nav>

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
                        ? `Fonte carregada: ${autoStorageStatus.fileName} as ${autoStorageStatus.loadedAt.toLocaleTimeString('pt-BR', {
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
                        Importar CSV diario
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
            ) : null}

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
            {profile?.role === 'admin' ? (
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

                {profile?.role === 'admin' ? (
                  <div className="flex flex-col gap-3 sm:min-w-[360px]">
                    <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                      Arquivo Explorer
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
                        : 'Importar Explorer'}
                    </button>
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
            </>
            ) : null}

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
            {profile?.role === 'admin' ? (
              <section className="mt-6 rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
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
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700 md:col-span-2">
                    Resumo
                    <input
                      value={ticketForm.summary}
                      onChange={(event) => updateTicketForm('summary', event.target.value)}
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
                    <input
                      value={ticketForm.priority ?? ''}
                      onChange={(event) => updateTicketForm('priority', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Solicitante
                    <input
                      value={ticketForm.requester ?? ''}
                      onChange={(event) => updateTicketForm('requester', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Organizacao
                    <input
                      value={ticketForm.beneficiaryOrganization ?? ''}
                      onChange={(event) =>
                        updateTicketForm('beneficiaryOrganization', event.target.value)
                      }
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Tipo de ticket
                    <input
                      value={ticketForm.ticketType ?? ''}
                      onChange={(event) => updateTicketForm('ticketType', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                    Status do SLA
                    <select
                      value={ticketForm.slaStatus ?? ''}
                      onChange={(event) => updateTicketForm('slaStatus', event.target.value)}
                      className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">Nao informado</option>
                      <option>No SLA</option>
                      <option>SLA violado</option>
                      <option>Nao aplicado</option>
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

                <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
                      Pesquisar chamado
                      <input
                        type="search"
                        value={ticketSearchTerm}
                        onChange={(event) => setTicketSearchTerm(event.target.value)}
                        placeholder="Caso, resumo, solicitante, status, motivo ou tipo"
                        className="h-11 rounded-2xl border border-brand-100 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setTicketSearchTerm('')}
                      disabled={!ticketSearchTerm}
                      className="h-11 rounded-2xl border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Limpar
                    </button>
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
                        <th className="px-4 py-3">Resumo</th>
                        <th className="px-4 py-3">Solicitante</th>
                        <th className="px-4 py-3">Acoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-50">
                      {filteredAdminTicketRows.slice(0, 25).map((row, index) => (
                        <tr key={`${row.__id ?? getTicketCaseNumber(row)}-${index}`}>
                          <td className="px-4 py-3 font-medium text-surface-900">
                            {getTicketCaseNumber(row) || '-'}
                          </td>
                          <td className="px-4 py-3 text-surface-700">{row.Status || '-'}</td>
                          <td className="max-w-[360px] px-4 py-3 text-surface-700">
                            <span className="line-clamp-1">{row.Resumo || '-'}</span>
                          </td>
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
                          <td className="px-4 py-8 text-center text-sm text-surface-700" colSpan={5}>
                            Nenhum chamado encontrado.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
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
            ) : null}

            <section className="mt-6">
              <TicketsTab rows={ticketRows} />
            </section>
          </>
        ) : null}

        {activeTab === 'settings' ? <UserSettingsPage /> : null}
      </div>
    </main>
  );
}

