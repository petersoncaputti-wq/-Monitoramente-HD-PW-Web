import { useMemo, useState } from 'react';
import { AverageGrowthRateCard } from '@/components/AverageGrowthRateCard';
import { ExcelUploader } from '@/components/ExcelUploader';
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
  ProjectWiseWebUserRow,
  ProjectWiseUserRow,
  TicketRow,
} from '@/types/monitoring';
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

function isMonitoringRow(row: ImportedWorkbookData['rows'][number]): row is MonitoringRow {
  return 'TotalGB' in row && 'UsadoGB' in row && 'LivreGB' in row;
}

function isProjectWiseUserRow(
  row: ImportedWorkbookData['rows'][number],
): row is ProjectWiseUserRow {
  return 'Ultimoacesso' in row && 'Elegivelexclusao' in row;
}

function isProjectWiseWebUserRow(
  row: ImportedWorkbookData['rows'][number],
): row is ProjectWiseWebUserRow {
  return 'LastLoginDate' in row && 'ProfileCreationDate' in row && 'Locked' in row;
}

function isTicketRow(row: ImportedWorkbookData['rows'][number]): row is TicketRow {
  return 'StatusdoSLA' in row && 'Categorização' in row && 'Abertoem' in row;
}

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('storage');
  const [storageData, setStorageData] = useState<ImportedWorkbookData | null>(null);
  const [projectWiseUsersData, setProjectWiseUsersData] =
    useState<ImportedWorkbookData | null>(null);
  const [projectWiseWebUsersData, setProjectWiseWebUsersData] =
    useState<ImportedWorkbookData | null>(null);
  const [ticketsData, setTicketsData] = useState<ImportedWorkbookData | null>(null);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const rows = useMemo(
    () => (storageData?.rows.filter(isMonitoringRow) ?? []),
    [storageData],
  );
  const projectWiseUserRows = useMemo(
    () => (projectWiseUsersData?.rows.filter(isProjectWiseUserRow) ?? []),
    [projectWiseUsersData],
  );
  const projectWiseWebUserRows = useMemo(
    () => (projectWiseWebUsersData?.rows.filter(isProjectWiseWebUserRow) ?? []),
    [projectWiseWebUsersData],
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

  function handleDataLoaded(data: ImportedWorkbookData) {
    if (data.kind === 'projectWiseUsers') {
      setProjectWiseUsersData(data);
      setActiveTab('projectWiseUsers');
      return;
    }

    if (data.kind === 'projectWiseWebUsers') {
      setProjectWiseWebUsersData(data);
      setActiveTab('projectWiseUsers');
      return;
    }

    if (data.kind === 'tickets') {
      setTicketsData(data);
      setActiveTab('tickets');
      return;
    }

    const monitoringRows = data.rows.filter(isMonitoringRow);
    const range = getRowsDateRange(monitoringRows);

    setStorageData(data);
    setActiveTab('storage');
    setPeriodStartDate(range?.minDate ?? '');
    setPeriodEndDate(range?.maxDate ?? '');
  }

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
              Monitoramento de Armazenamento em Disco
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
        <section className="mt-2">
          <ExcelUploader onDataLoaded={handleDataLoaded} />
        </section>

        <nav className="mt-6 flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2 shadow-soft">
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
              explorerFileName={projectWiseUsersData?.fileName}
              explorerRows={projectWiseUserRows}
              webFileName={projectWiseWebUsersData?.fileName}
              webRows={projectWiseWebUserRows}
            />
          </section>
        ) : null}

        {activeTab === 'tickets' ? (
          <section className="mt-6">
            <TicketsTab fileName={ticketsData?.fileName} rows={ticketRows} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
