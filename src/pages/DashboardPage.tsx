import { useEffect, useMemo, useState } from 'react';
import { AverageGrowthRateCard } from '@/components/AverageGrowthRateCard';
import { FreeSpaceCard } from '@/components/FreeSpaceCard';
import { LastUpdateCard } from '@/components/LastUpdateCard';
import { PeriodFilter } from '@/components/PeriodFilter';
import { PeriodVariationCard } from '@/components/PeriodVariationCard';
import { ProjectWiseUsersTab } from '@/components/ProjectWiseUsersTab';
import { TicketsTab } from '@/components/TicketsTab';
import { TwelveMonthForecastCard } from '@/components/TwelveMonthForecastCard';
import { TotalCapacityCard } from '@/components/TotalCapacityCard';
import { UsagePercentageCard } from '@/components/UsagePercentageCard';
import { UsedSpaceCard } from '@/components/UsedSpaceCard';
import type {
  ImportedWorkbookData,
  MonitoringRow,
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

const EXTERNAL_STORAGE_SOURCE_URL = import.meta.env.VITE_STORAGE_SOURCE_URL?.trim();

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

async function syncLocalStorageSource(): Promise<StorageSyncInfo | undefined> {
  const response = await fetch('/api/sync-storage', {
    method: 'POST',
  });

  if (response.status === 404) {
    return undefined;
  }

  const result = (await response.json().catch(() => null)) as StorageSyncResponse | null;

  if (!response.ok) {
    throw new Error(result?.error ?? 'Nao foi possivel sincronizar a fonte local.');
  }

  return result?.sync;
}

function isMonitoringRow(row: ImportedWorkbookData['rows'][number]): row is MonitoringRow {
  return 'TotalGB' in row && 'UsadoGB' in row && 'LivreGB' in row;
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('storage');
  const [storageData, setStorageData] = useState<ImportedWorkbookData | null>(null);
  const [autoStorageStatus, setAutoStorageStatus] =
    useState<AutoStorageStatus>({ state: 'idle' });
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const rows = useMemo(
    () => (storageData?.rows.filter(isMonitoringRow) ?? []),
    [storageData],
  );
  const projectWiseUserRows = useMemo(() => [], []);
  const projectWiseWebUserRows = useMemo(() => [], []);
  const ticketRows = useMemo(() => [], []);
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
            : 'Nao foi possivel sincronizar a fonte local.';

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
          throw new Error('A fonte encontrada nao possui os cabecalhos de armazenamento.');
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
          : 'Nao foi possivel carregar a fonte automatica de armazenamento.';

    setAutoStorageStatus(
      EXTERNAL_STORAGE_SOURCE_URL || message?.includes('cabecalhos')
        ? { state: 'error', message }
        : { state: 'missing' },
    );
  }

  useEffect(() => {
    void loadAutoStorageSource();
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
                      ? 'Atualizando a leitura da planilha padrao...'
                      : autoStorageStatus.state === 'ready'
                        ? `Fonte carregada: ${autoStorageStatus.fileName} as ${autoStorageStatus.loadedAt.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}. ${autoStorageStatus.rowsCount} registros lidos.`
                        : autoStorageStatus.state === 'missing'
                          ? 'Configure VITE_STORAGE_SOURCE_URL ou coloque o Excel diario em public/dados/armazenamento.xlsx.'
                          : autoStorageStatus.state === 'error'
                            ? autoStorageStatus.message
                            : 'O painel vai tentar carregar a planilha padrao automaticamente.'}
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

              {autoStorageStatus.state === 'ready' && autoStorageStatus.syncInfo ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-xs text-surface-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Sincronizacao
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
          <section className="mt-6">
            <ProjectWiseUsersTab
              explorerFileName={undefined}
              explorerRows={projectWiseUserRows}
              webFileName={undefined}
              webRows={projectWiseWebUserRows}
            />
          </section>
        ) : null}

        {activeTab === 'tickets' ? (
          <section className="mt-6">
            <TicketsTab fileName={undefined} rows={ticketRows} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
