import { useState } from 'react';
import { AverageGrowthRateCard } from '@/components/AverageGrowthRateCard';
import { DaysUntilFullCard } from '@/components/DaysUntilFullCard';
import { ExcelUploader } from '@/components/ExcelUploader';
import { FreeSpaceCard } from '@/components/FreeSpaceCard';
import { LastUpdateCard } from '@/components/LastUpdateCard';
import { PeriodVariationCard } from '@/components/PeriodVariationCard';
import { TwelveMonthForecastCard } from '@/components/TwelveMonthForecastCard';
import { TotalCapacityCard } from '@/components/TotalCapacityCard';
import { UsagePercentageCard } from '@/components/UsagePercentageCard';
import { UsedSpaceCard } from '@/components/UsedSpaceCard';
import type { ImportedWorkbookData } from '@/types/monitoring';
import {
  getAverageGrowthRateKpi,
  getDaysUntilFullKpi,
  getFreeSpaceKpi,
  getLatestUpdateKpi,
  getPeriodVariationKpi,
  getTwelveMonthForecastKpi,
  getTotalCapacityKpi,
  getUsagePercentageKpi,
  getUsedSpaceKpi,
} from '@/utils/monitoringKpis';

export function DashboardPage() {
  const [importedData, setImportedData] = useState<ImportedWorkbookData | null>(null);
  const latestUpdate = getLatestUpdateKpi(importedData?.rows ?? []);
  const totalCapacity = getTotalCapacityKpi(importedData?.rows ?? []);
  const usedSpace = getUsedSpaceKpi(importedData?.rows ?? []);
  const freeSpace = getFreeSpaceKpi(importedData?.rows ?? []);
  const usagePercentage = getUsagePercentageKpi(importedData?.rows ?? []);
  const periodVariation = getPeriodVariationKpi(importedData?.rows ?? []);
  const averageGrowthRate = getAverageGrowthRateKpi(importedData?.rows ?? []);
  const twelveMonthForecast = getTwelveMonthForecastKpi(importedData?.rows ?? []);
  const daysUntilFull = getDaysUntilFullKpi(importedData?.rows ?? []);

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
          <ExcelUploader onDataLoaded={setImportedData} />
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
          <DaysUntilFullCard daysUntilFull={daysUntilFull} />
        </section>
      </div>
    </main>
  );
}
