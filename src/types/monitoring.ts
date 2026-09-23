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

export interface ProjectWiseUserRow {
  Nome: string;
  Email: string;
  ID: number | string;
  Datacriacao: string;
  Descricao: string;
  Ultimoacesso: string;
  Status: string;
  Statusacesso: string;
  StatusProjectWise: string;
  Elegivelexclusao: string;
  Motivo: string;
  Acaoexecutada: string;
  Resultado: string;
  [key: string]: string | number | null | undefined;
}

export interface ProjectWiseWebUserRow {
  Email: string;
  CommunicationEmail: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  ProfileCountry: string;
  Language: string;
  EntitlementCountry: string;
  'EntitlementGroup(s)': string;
  CostAllocationGroup: string;
  'UserManagementGroup(s)': string;
  'Role(s)': string;
  GlobalFulfillmentContact: string;
  'FulfillmentContactCountry(s)': string;
  City: string;
  CompanyName: string;
  JobTitle: string;
  Locked: string;
  ProfileCreationDate: string;
  LastLoginDate: string;
  MFA: string;
  [key: string]: string | number | null | undefined;
}

export interface E365UsageRow {
  UltimateID: string;
  AccountName: string;
  CountryIso: string;
  ProductID: string;
  Product: string;
  IsConnected: string;
  ImsID: string;
  UniquePersona: string;
  UsageDate: string;
  UsageQuarter: string;
  UsageInterval: string;
  Currency: string;
  Gross: string | number;
  Net: string | number;
  ExportedOn: string;
  [key: string]: string | number | null | undefined;
}

export interface TicketRow {
  'Caso n.º': string;
  Status: string;
  Motivo: string;
  Resumo?: string;
  Abertoem: string;
  Atualizado: string;
  Fechadoem: string;
  Prioridade: string;
  Solicitante: string;
  Organizaçãodosolicitante: string;
  AgenteAtribuído: string;
  Atribuído: string;
  Grupoatribuído: string;
  Tipodeticket: string;
  StatusdoSLA: string;
  Organizaçãodobeneficiário: string;
  Solicitadopara: string;
  [key: string]: string | number | null | undefined;
}

export type WorkbookKind =
  | 'storage'
  | 'projectWiseUsers'
  | 'projectWiseWebUsers'
  | 'tickets'
  | 'unknown';

export interface ImportedWorkbookData {
  fileName: string;
  rows: Array<MonitoringRow | ProjectWiseUserRow | ProjectWiseWebUserRow | TicketRow>;
  headers: string[];
  kind: WorkbookKind;
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

