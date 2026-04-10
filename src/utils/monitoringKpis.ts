import * as XLSX from 'xlsx';
import type {
  AverageGrowthRateResult,
  DaysUntilFullResult,
  FreeSpaceResult,
  LatestUpdateResult,
  LowestFreeSpaceResult,
  MonitoringRow,
  PeakUsageResult,
  PeriodVariationResult,
  TwelveMonthForecastResult,
  TotalCapacityResult,
  UsagePercentageResult,
  UsedSpaceResult,
} from '@/types/monitoring';
import {
  formatGigabytesValue,
  formatPercentageValue,
  formatNumber,
  formatStorageValue,
  normalizePercentageValue,
  parseSpreadsheetNumber,
} from '@/utils/excel';

function parseDateValue(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    const brMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  return null;
}

function parseTimeValue(
  value: string | number | null | undefined,
): { hours: number; minutes: number } | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    return {
      hours: Math.floor(totalMinutes / 60) % 24,
      minutes: totalMinutes % 60,
    };
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) {
      return null;
    }

    return { hours, minutes };
  }

  return null;
}

export function combineRowDateTime(row: MonitoringRow): Date | null {
  const date = parseDateValue(row.Data);
  const time = parseTimeValue(row.Hora);

  if (!date || !time) {
    return null;
  }

  const combined = new Date(date);
  combined.setHours(time.hours, time.minutes, 0, 0);
  return Number.isNaN(combined.getTime()) ? null : combined;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getLatestValidRow(rows: MonitoringRow[]): MonitoringRow | null {
  const datedRows = getValidRowsWithDateTime(rows);

  if (datedRows.length === 0) {
    return null;
  }

  return datedRows.reduce((current, candidate) =>
    candidate.dateTime.getTime() > current.dateTime.getTime() ? candidate : current,
  ).row;
}

function getValidRowsWithDateTime(rows: MonitoringRow[]) {
  return rows
    .map((row) => ({
      row,
      dateTime: combineRowDateTime(row),
    }))
    .filter(
      (entry): entry is { row: MonitoringRow; dateTime: Date } => entry.dateTime instanceof Date,
    );
}

function getOrderedRowsWithUsedSpace(rows: MonitoringRow[]) {
  return getValidRowsWithDateTime(rows)
    .map((entry) => ({
      ...entry,
      usedSpace: parseSpreadsheetNumber(entry.row.UsadoGB),
    }))
    .filter(
      (
        entry,
      ): entry is { row: MonitoringRow; dateTime: Date; usedSpace: number } =>
        entry.usedSpace !== null,
    )
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

function getPeriodComparison(rows: MonitoringRow[]) {
  const orderedRows = getOrderedRowsWithUsedSpace(rows);

  if (orderedRows.length < 2) {
    return null;
  }

  const firstEntry = orderedRows[0];
  const lastEntry = orderedRows[orderedRows.length - 1];
  const elapsedHours =
    (lastEntry.dateTime.getTime() - firstEntry.dateTime.getTime()) / (1000 * 60 * 60);

  if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) {
    return null;
  }

  return {
    firstEntry,
    lastEntry,
    elapsedHours,
    variation: lastEntry.usedSpace - firstEntry.usedSpace,
  };
}

function getDaysUntilFullTone(days: number): DaysUntilFullResult['tone'] {
  if (days <= 30) {
    return 'critical';
  }

  if (days <= 90) {
    return 'warning';
  }

  if (days <= 180) {
    return 'attention';
  }

  return 'neutral';
}

export function getLatestUpdateKpi(rows: MonitoringRow[]): LatestUpdateResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '--/--/---- --:--',
      helperText: 'Aguardando arquivo',
    };
  }

  const latestRow = getLatestValidRow(rows);

  if (!latestRow) {
    return {
      status: 'invalid',
      value: '--/--/---- --:--',
      helperText: 'Data e hora indisponíveis na planilha',
    };
  }

  const latest = combineRowDateTime(latestRow);

  if (!latest) {
    return {
      status: 'invalid',
      value: '--/--/---- --:--',
      helperText: 'Data e hora indisponíveis na planilha',
    };
  }

  return {
    status: 'ready',
    value: formatDateTime(latest),
    helperText: 'Registro mais recente importado',
  };
}

export function getTotalCapacityKpi(rows: MonitoringRow[]): TotalCapacityResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
    };
  }

  const validCapacities = rows
    .map((row) => parseSpreadsheetNumber(row.TotalGB))
    .filter((value): value is number => value !== null);

  if (validCapacities.length === 0) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'TotalGB indisponível na planilha',
    };
  }

  const frequencyMap = new Map<string, { value: number; count: number }>();

  for (const capacity of validCapacities) {
    const key = capacity.toFixed(2);
    const current = frequencyMap.get(key);

    if (current) {
      current.count += 1;
    } else {
      frequencyMap.set(key, { value: capacity, count: 1 });
    }
  }

  const selectedCapacity = [...frequencyMap.values()].reduce((best, candidate) =>
    candidate.count > best.count ? candidate : best,
  ).value;

  return {
    status: 'ready',
    value: formatStorageValue(selectedCapacity),
    helperText: 'Capacidade identificada na planilha',
  };
}

export function getUsedSpaceKpi(rows: MonitoringRow[]): UsedSpaceResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
    };
  }

  const latestRow = getLatestValidRow(rows);

  if (!latestRow) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'Data e hora indisponíveis na planilha',
    };
  }

  const usedSpace = parseSpreadsheetNumber(latestRow.UsadoGB);

  if (usedSpace === null) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'UsadoGB indisponível no registro mais recente',
    };
  }

  return {
    status: 'ready',
    value: formatStorageValue(usedSpace),
    helperText: 'Valor do registro mais recente',
  };
}

export function getFreeSpaceKpi(rows: MonitoringRow[]): FreeSpaceResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
    };
  }

  const latestRow = getLatestValidRow(rows);

  if (!latestRow) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'Data e hora indisponíveis na planilha',
    };
  }

  const freeSpace = parseSpreadsheetNumber(latestRow.LivreGB);

  if (freeSpace === null) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'LivreGB indisponível no registro mais recente',
    };
  }

  return {
    status: 'ready',
    value: formatStorageValue(freeSpace),
    helperText: 'Valor do registro mais recente',
  };
}

function getUsageTone(value: number): UsagePercentageResult['tone'] {
  if (value >= 90) {
    return 'critical';
  }

  if (value >= 80) {
    return 'warning';
  }

  if (value >= 70) {
    return 'attention';
  }

  if (value >= 0) {
    return 'good';
  }

  return 'neutral';
}

export function getUsagePercentageKpi(rows: MonitoringRow[]): UsagePercentageResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- %',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const latestRow = getLatestValidRow(rows);

  if (!latestRow) {
    return {
      status: 'invalid',
      value: '-- %',
      helperText: 'Data e hora indisponíveis na planilha',
      tone: 'neutral',
    };
  }

  const percentageFromColumn = parseSpreadsheetNumber(latestRow.PercentualUsado);

  if (percentageFromColumn !== null) {
    const normalizedPercentage = normalizePercentageValue(percentageFromColumn);

    return {
      status: 'ready',
      value: formatPercentageValue(normalizedPercentage),
      helperText: 'Percentual do registro mais recente',
      tone: getUsageTone(normalizedPercentage),
    };
  }

  const usedSpace = parseSpreadsheetNumber(latestRow.UsadoGB);
  const totalCapacity = parseSpreadsheetNumber(latestRow.TotalGB);

  if (usedSpace === null || totalCapacity === null || totalCapacity <= 0) {
    return {
      status: 'invalid',
      value: '-- %',
      helperText: 'PercentualUsado indisponível e não foi possível calcular',
      tone: 'neutral',
    };
  }

  const calculatedPercentage = (usedSpace / totalCapacity) * 100;

  return {
    status: 'ready',
    value: formatPercentageValue(calculatedPercentage),
    helperText: 'Calculado a partir do registro mais recente',
    tone: getUsageTone(calculatedPercentage),
  };
}

export function getPeriodVariationKpi(rows: MonitoringRow[]): PeriodVariationResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const orderedRows = getOrderedRowsWithUsedSpace(rows);

  if (orderedRows.length < 2) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'Registros insuficientes para comparar o período',
      tone: 'neutral',
    };
  }

  const firstUsedSpace = orderedRows[0].usedSpace;
  const lastUsedSpace = orderedRows[orderedRows.length - 1].usedSpace;
  const variation = lastUsedSpace - firstUsedSpace;
  const sign = variation > 0 ? '+' : variation < 0 ? '-' : '';
  const tone =
    variation > 0 ? 'positive' : variation < 0 ? 'negative' : ('neutral' as const);

  return {
    status: 'ready',
    value: `${sign}${formatGigabytesValue(Math.abs(variation))}`,
    helperText: 'Comparação entre o primeiro e o último registro',
    tone,
  };
}

export function getAverageGrowthRateKpi(rows: MonitoringRow[]): AverageGrowthRateResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB/h',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const comparison = getPeriodComparison(rows);

  if (!comparison) {
    return {
      status: 'invalid',
      value: '-- GB/h',
      helperText: 'Registros insuficientes para calcular a taxa média',
      tone: 'neutral',
    };
  }

  const ratePerHour = comparison.variation / comparison.elapsedHours;
  const ratePerDay = ratePerHour * 24;
  const sign = ratePerHour > 0 ? '+' : ratePerHour < 0 ? '-' : '';
  const tone =
    ratePerHour > 0 ? 'positive' : ratePerHour < 0 ? 'negative' : ('neutral' as const);

  return {
    status: 'ready',
    value: `${sign}${formatNumber(Math.abs(ratePerHour), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} GB/h`,
    helperText: `${sign}${formatNumber(Math.abs(ratePerDay), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} GB/dia em média`,
    tone,
  };
}

export function getTwelveMonthForecastKpi(rows: MonitoringRow[]): TwelveMonthForecastResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const comparison = getPeriodComparison(rows);

  if (!comparison) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'Registros insuficientes para projetar 12 meses',
      tone: 'neutral',
    };
  }

  const ratePerHour = comparison.variation / comparison.elapsedHours;
  const projectedUsedSpace = comparison.lastEntry.usedSpace + ratePerHour * 24 * 365;
  const totalCapacity = parseSpreadsheetNumber(comparison.lastEntry.row.TotalGB);

  return {
    status: 'ready',
    value: formatStorageValue(projectedUsedSpace),
    helperText:
      totalCapacity !== null && projectedUsedSpace > totalCapacity
        ? 'Projeção linear acima da capacidade atual'
        : 'Projeção linear com base no histórico importado',
    tone:
      totalCapacity !== null && projectedUsedSpace > totalCapacity ? 'attention' : 'neutral',
  };
}

export function getDaysUntilFullKpi(rows: MonitoringRow[]): DaysUntilFullResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- dias',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const comparison = getPeriodComparison(rows);
  const latestRow = getLatestValidRow(rows);

  if (!comparison || !latestRow) {
    return {
      status: 'invalid',
      value: '-- dias',
      helperText: 'Dados insuficientes para estimar o esgotamento',
      tone: 'neutral',
    };
  }

  const currentFreeSpace = parseSpreadsheetNumber(latestRow.LivreGB);

  if (currentFreeSpace === null) {
    return {
      status: 'invalid',
      value: '-- dias',
      helperText: 'LivreGB indisponível no registro mais recente',
      tone: 'neutral',
    };
  }

  const growthPerDay = (comparison.variation / comparison.elapsedHours) * 24;

  if (!Number.isFinite(growthPerDay)) {
    return {
      status: 'invalid',
      value: '-- dias',
      helperText: 'Não foi possível calcular o ritmo médio de crescimento',
      tone: 'neutral',
    };
  }

  if (growthPerDay === 0) {
    return {
      status: 'ready',
      value: 'Sem previsão',
      helperText: 'Não houve crescimento no período importado',
      tone: 'neutral',
    };
  }

  if (growthPerDay < 0) {
    return {
      status: 'ready',
      value: 'Sem risco',
      helperText: 'Sem risco no ritmo atual',
      tone: 'neutral',
    };
  }

  const daysUntilFull = currentFreeSpace / growthPerDay;

  if (!Number.isFinite(daysUntilFull) || daysUntilFull < 0) {
    return {
      status: 'invalid',
      value: '-- dias',
      helperText: 'Não foi possível estimar os dias restantes',
      tone: 'neutral',
    };
  }

  return {
    status: 'ready',
    value: `${formatNumber(daysUntilFull, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} dias`,
    helperText: 'Estimativa com base no espaço livre atual e no ritmo médio',
    tone: getDaysUntilFullTone(daysUntilFull),
  };
}

export function getPeakUsageKpi(rows: MonitoringRow[]): PeakUsageResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const validRows = getValidRowsWithDateTime(rows)
    .map((entry) => ({
      ...entry,
      usedSpace: parseSpreadsheetNumber(entry.row.UsadoGB),
    }))
    .filter(
      (
        entry,
      ): entry is { row: MonitoringRow; dateTime: Date; usedSpace: number } =>
        entry.usedSpace !== null,
    );

  if (validRows.length === 0) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'UsadoGB indisponível nos registros importados',
      tone: 'neutral',
    };
  }

  const peak = validRows.reduce((current, candidate) =>
    candidate.usedSpace > current.usedSpace ? candidate : current,
  );

  return {
    status: 'ready',
    value: formatStorageValue(peak.usedSpace),
    helperText: `Registrado em ${formatDateTime(peak.dateTime)}`,
    tone: 'highlight',
  };
}

export function getLowestFreeSpaceKpi(rows: MonitoringRow[]): LowestFreeSpaceResult {
  if (rows.length === 0) {
    return {
      status: 'empty',
      value: '-- GB',
      helperText: 'Aguardando arquivo',
      tone: 'neutral',
    };
  }

  const validRows = getValidRowsWithDateTime(rows)
    .map((entry) => ({
      ...entry,
      freeSpace: parseSpreadsheetNumber(entry.row.LivreGB),
    }))
    .filter(
      (
        entry,
      ): entry is { row: MonitoringRow; dateTime: Date; freeSpace: number } =>
        entry.freeSpace !== null,
    );

  if (validRows.length === 0) {
    return {
      status: 'invalid',
      value: '-- GB',
      helperText: 'LivreGB indisponível nos registros importados',
      tone: 'neutral',
    };
  }

  const lowest = validRows.reduce((current, candidate) =>
    candidate.freeSpace < current.freeSpace ? candidate : current,
  );

  return {
    status: 'ready',
    value: formatStorageValue(lowest.freeSpace),
    helperText: `Registrado em ${formatDateTime(lowest.dateTime)}`,
    tone: 'attention',
  };
}
