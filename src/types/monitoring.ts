export interface MonitoringRow {
  Data: string;
  Hora: string;
  Computador: string;
  Unidade: string;
  TotalGB: number | string;
  UsadoGB: number | string;
  LivreGB: number | string;
  PercentualUsado: number | string;
  PercentualLivre: number | string;
  [key: string]: string | number | null | undefined;
}

export interface ImportedWorkbookData {
  fileName: string;
  rows: MonitoringRow[];
  headers: string[];
}

export interface LatestUpdateResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
}

export interface TotalCapacityResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
}

export interface UsedSpaceResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
}

export interface FreeSpaceResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
}

export interface UsagePercentageResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'good' | 'attention' | 'warning' | 'critical';
}

export interface PeriodVariationResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'positive' | 'negative';
}

export interface AverageGrowthRateResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'positive' | 'negative';
}

export interface PeakUsageResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'highlight';
}

export interface LowestFreeSpaceResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'attention';
}

export interface TwelveMonthForecastResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'attention';
}

export interface DaysUntilFullResult {
  status: 'empty' | 'invalid' | 'ready';
  value: string;
  helperText: string;
  tone: 'neutral' | 'attention' | 'warning' | 'critical';
}
