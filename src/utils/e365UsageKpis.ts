import type { E365UsageRow, ProjectWiseWebUserRow } from '@/types/monitoring';

export interface E365ApplicationSummary {
  application: string;
  spend: number;
  users: number;
  costPerUser: number;
}

export interface E365QuarterSummary {
  quarter: string;
  spend: number;
  users: number;
  applications: E365ApplicationSummary[];
  minUsageDate: string;
  maxUsageDate: string;
}

export interface E365RegistrationComparison {
  billedOutsidePortal: number;
  billingCoveragePercentage: number;
  portalBilled: number;
  portalNotBilled: number;
  portalUsers: number;
  quarterBilledUsers: number;
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const text = normalize(value);
  if (!text) return 0;

  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueUserKey(row: E365UsageRow) {
  return normalize(row.ImsID).toLowerCase() || normalize(row.UniquePersona).toLowerCase();
}

export function getE365RegistrationComparison(
  portalRows: ProjectWiseWebUserRow[],
  quarterRows: E365UsageRow[],
): E365RegistrationComparison {
  const portalUsers = new Map<string, Set<string>>();
  const portalAliases = new Set<string>();

  portalRows.forEach((row, index) => {
    const email = normalize(row.Email).toLowerCase();
    const communicationEmail = normalize(row.CommunicationEmail).toLowerCase();
    const canonicalEmail = email || communicationEmail || `__sem_email_${index}`;

    const aliases = new Set([email, communicationEmail].filter(Boolean));
    const currentAliases = portalUsers.get(canonicalEmail) ?? new Set<string>();
    aliases.forEach((alias) => currentAliases.add(alias));
    portalUsers.set(canonicalEmail, currentAliases);
    aliases.forEach((alias) => portalAliases.add(alias));
  });

  const billedEmails = new Set(
    quarterRows
      .map((row) => normalize(row.UniquePersona).toLowerCase())
      .filter(Boolean),
  );
  const portalBilled = [...portalUsers.values()].filter((aliases) =>
    [...aliases].some((email) => billedEmails.has(email)),
  ).length;
  const portalUserCount = portalUsers.size;

  return {
    billedOutsidePortal: [...billedEmails].filter((email) => !portalAliases.has(email)).length,
    billingCoveragePercentage: portalUserCount ? (portalBilled / portalUserCount) * 100 : 0,
    portalBilled,
    portalNotBilled: Math.max(portalUserCount - portalBilled, 0),
    portalUsers: portalUserCount,
    quarterBilledUsers: billedEmails.size,
  };
}

export function formatE365Quarter(value: string) {
  const match = normalize(value).match(/^(\d{4})([1-4])$/);
  return match ? `Q${match[2]} ${match[1]}` : value || '-';
}

export function formatE365QuarterPeriod(value: string) {
  const match = normalize(value).match(/^(\d{4})([1-4])$/);

  if (!match) return '-';

  const periods: Record<string, string> = {
    '1': 'janeiro a março',
    '2': 'abril a junho',
    '3': 'julho a setembro',
    '4': 'outubro a dezembro',
  };

  return `${periods[match[2]]} de ${match[1]}`;
}

export function getE365QuarterSummaries(rows: E365UsageRow[]): E365QuarterSummary[] {
  const quarterGroups = new Map<string, E365UsageRow[]>();

  for (const row of rows) {
    const quarter = normalize(row.UsageQuarter);
    if (!quarter) continue;
    quarterGroups.set(quarter, [...(quarterGroups.get(quarter) ?? []), row]);
  }

  return [...quarterGroups.entries()]
    .map(([quarter, quarterRows]) => {
      const applicationGroups = new Map<string, E365UsageRow[]>();
      for (const row of quarterRows) {
        const application = normalize(row.Product) || 'Aplicação não informada';
        applicationGroups.set(application, [...(applicationGroups.get(application) ?? []), row]);
      }

      const applications = [...applicationGroups.entries()]
        .map(([application, applicationRows]) => {
          const spend = applicationRows.reduce((total, row) => total + parseAmount(row.Net), 0);
          const users = new Set(applicationRows.map(uniqueUserKey).filter(Boolean)).size;
          return { application, spend, users, costPerUser: users ? spend / users : 0 };
        })
        .sort((a, b) => b.spend - a.spend);
      const dates = quarterRows.map((row) => normalize(row.UsageDate)).filter(Boolean).sort();
      const spend = quarterRows.reduce((total, row) => total + parseAmount(row.Net), 0);
      const users = new Set(quarterRows.map(uniqueUserKey).filter(Boolean)).size;

      return {
        quarter,
        spend,
        users,
        applications,
        minUsageDate: dates[0] ?? '',
        maxUsageDate: dates[dates.length - 1] ?? '',
      };
    })
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
}

export function formatE365Currency(value: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatE365Date(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : new Intl.DateTimeFormat('pt-BR').format(date);
}
