import type { ProjectWiseUserRow, ProjectWiseWebUserRow } from '@/types/monitoring';
import { formatNumber } from '@/utils/excel';

export interface ProjectWiseUsersSummary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  eligibleForRemoval: number;
  withoutAccessRecord: number;
  recentlyCreatedExceptions: number;
  recentlyCreatedUsers: number;
  activePercentage: string;
  inactivePercentage: string;
  removalPercentage: string;
  withoutAccessPercentage: string;
  recentlyCreatedExceptionsPercentage: string;
  recentlyCreatedUsersPercentage: string;
  topReasons: Array<{ reason: string; count: number }>;
}

export interface ProjectWiseWebUsersSummary {
  totalUsers: number;
  withLastLogin: number;
  withoutLastLogin: number;
  recentLastLogin: number;
  recentlyCreatedUsers: number;
  inactiveOver180Days: number;
  lockedUsers: number;
  mfaEnabled: number;
  explorerEntitlements: number;
  withLoginPercentage: string;
  noLoginPercentage: string;
  recentLoginPercentage: string;
  recentlyCreatedUsersPercentage: string;
  inactiveOver180Percentage: string;
}

export interface ProjectWiseUsersComparison {
  inBoth: number;
  explorerOnly: number;
  webOnly: number;
  eligibleInExplorerAndPresentOnWeb: number;
  explorerWithoutEmail: number;
  explorerOnlyRows: ProjectWiseUserRow[];
  webOnlyRows: ProjectWiseWebUserRow[];
  eligibleStillOnWebRows: ProjectWiseUserRow[];
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeComparableText(value: unknown): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function isYes(value: unknown): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'sim' || normalized === 'yes';
}

function isTrue(value: unknown): boolean {
  return normalizeText(value).toLowerCase() === 'true';
}

function formatPercentage(count: number, total: number): string {
  if (total === 0) {
    return '0,0%';
  }

  return `${formatNumber((count / total) * 100, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function parseDate(value: unknown): Date | null {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())
        ? Number(value.trim().replace(',', '.'))
        : null;

  if (numericValue !== null && Number.isFinite(numericValue)) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + numericValue * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const brazilianDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (brazilianDateMatch) {
    const [, day, month, year] = brazilianDateMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInactiveCutoffDate(referenceDate = new Date()): Date {
  const cutoffDate = new Date(referenceDate);
  cutoffDate.setDate(cutoffDate.getDate() - 180);
  cutoffDate.setHours(0, 0, 0, 0);
  return cutoffDate;
}

function getRecentlyCreatedCutoffDate(referenceDate = new Date()): Date {
  const cutoffDate = new Date(referenceDate);
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  cutoffDate.setHours(0, 0, 0, 0);
  return cutoffDate;
}

function getReferenceEndDate(referenceDate = new Date()): Date {
  const endDate = new Date(referenceDate);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}

export function isProjectWiseWebUserActiveWithin180Days(
  row: ProjectWiseWebUserRow,
  referenceDate = new Date(),
): boolean {
  const lastLoginDate = parseDate(row.LastLoginDate);

  if (!lastLoginDate) {
    return false;
  }

  return lastLoginDate >= getInactiveCutoffDate(referenceDate);
}

export function isProjectWiseWebUserRecentlyCreated(
  row: ProjectWiseWebUserRow,
  referenceDate = new Date(),
): boolean {
  const creationDate = parseDate(row.ProfileCreationDate);

  if (!creationDate) {
    return false;
  }

  return (
    creationDate >= getRecentlyCreatedCutoffDate(referenceDate) &&
    creationDate <= getReferenceEndDate(referenceDate)
  );
}

function isProjectWiseExplorerUserRecentlyCreated(
  row: ProjectWiseUserRow,
  referenceDate = new Date(),
): boolean {
  const dynamicCreationDateValue = Object.entries(row).find(([key]) =>
    normalizeComparableText(key).replace(/[^a-z0-9]/g, '').startsWith('datacria'),
  )?.[1];
  const creationDate = parseDate(
    row.Datacriacao ?? row['Data criação'] ?? dynamicCreationDateValue,
  );

  if (!creationDate) {
    return false;
  }

  return (
    creationDate >= getRecentlyCreatedCutoffDate(referenceDate) &&
    creationDate <= getReferenceEndDate(referenceDate)
  );
}

export function isProjectWiseWebUserActive(
  row: ProjectWiseWebUserRow,
  referenceDate = new Date(),
): boolean {
  return (
    isProjectWiseWebUserActiveWithin180Days(row, referenceDate) ||
    isProjectWiseWebUserRecentlyCreated(row, referenceDate)
  );
}

export function getProjectWiseUsersSummary(
  rows: ProjectWiseUserRow[],
): ProjectWiseUsersSummary {
  const totalUsers = rows.length;
  const activeUsers = rows.filter((row) => normalizeText(row.Status) === 'Ativo').length;
  const inactiveUsers = rows.filter((row) => normalizeText(row.Status) === 'Inativo').length;
  const eligibleForRemoval = rows.filter((row) => isYes(row.Elegivelexclusao)).length;
  const withoutAccessRecord = rows.filter(
    (row) => normalizeText(row.Ultimoacesso).toLowerCase() === 'sem registro',
  ).length;
  const recentlyCreatedExceptions = rows.filter((row) =>
    normalizeComparableText(row.Motivo)
      .includes('usuario criado ha menos de 30 dias'),
  ).length;
  const recentlyCreatedUsers = rows.filter((row) =>
    isProjectWiseExplorerUserRecentlyCreated(row),
  ).length;
  const reasonMap = new Map<string, number>();

  for (const row of rows) {
    const reason = normalizeText(row.Motivo);

    if (!reason) {
      continue;
    }

    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
  }

  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    eligibleForRemoval,
    withoutAccessRecord,
    recentlyCreatedExceptions,
    recentlyCreatedUsers,
    activePercentage: formatPercentage(activeUsers, totalUsers),
    inactivePercentage: formatPercentage(inactiveUsers, totalUsers),
    removalPercentage: formatPercentage(eligibleForRemoval, totalUsers),
    withoutAccessPercentage: formatPercentage(withoutAccessRecord, totalUsers),
    recentlyCreatedExceptionsPercentage: formatPercentage(
      recentlyCreatedExceptions,
      totalUsers,
    ),
    recentlyCreatedUsersPercentage: formatPercentage(recentlyCreatedUsers, totalUsers),
    topReasons: [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function getProjectWiseWebUsersSummary(
  rows: ProjectWiseWebUserRow[],
): ProjectWiseWebUsersSummary {
  const totalUsers = rows.length;
  const withLastLogin = rows.filter((row) => normalizeText(row.LastLoginDate)).length;
  const withoutLastLogin = totalUsers - withLastLogin;
  const recentLastLogin = rows.filter((row) =>
    isProjectWiseWebUserActiveWithin180Days(row),
  ).length;
  const recentlyCreatedUsers = rows.filter((row) =>
    isProjectWiseWebUserRecentlyCreated(row),
  ).length;
  const activeUsers = rows.filter((row) => isProjectWiseWebUserActive(row)).length;
  const inactiveOver180Days = totalUsers - activeUsers;
  const lockedUsers = rows.filter((row) => isTrue(row.Locked)).length;
  const mfaEnabled = rows.filter((row) => isTrue(row.MFA)).length;
  const explorerEntitlements = rows.filter((row) =>
    normalizeText(row['EntitlementGroup(s)']).includes('ProjectWise Explorer'),
  ).length;

  return {
    totalUsers,
    withLastLogin,
    withoutLastLogin,
    recentLastLogin,
    recentlyCreatedUsers,
    inactiveOver180Days,
    lockedUsers,
    mfaEnabled,
    explorerEntitlements,
    withLoginPercentage: formatPercentage(withLastLogin, totalUsers),
    noLoginPercentage: formatPercentage(withoutLastLogin, totalUsers),
    recentLoginPercentage: formatPercentage(recentLastLogin, totalUsers),
    recentlyCreatedUsersPercentage: formatPercentage(recentlyCreatedUsers, totalUsers),
    inactiveOver180Percentage: formatPercentage(inactiveOver180Days, totalUsers),
  };
}

export function getProjectWiseUsersComparison(
  explorerRows: ProjectWiseUserRow[],
  webRows: ProjectWiseWebUserRow[],
): ProjectWiseUsersComparison {
  const webByEmail = new Map(
    webRows
      .map((row) => [normalizeEmail(row.Email), row] as const)
      .filter(([email]) => email.length > 0),
  );
  const explorerByEmail = new Map(
    explorerRows
      .map((row) => [normalizeEmail(row.Email), row] as const)
      .filter(([email]) => email.length > 0),
  );
  const explorerOnlyRows = explorerRows.filter((row) => {
    const email = normalizeEmail(row.Email);
    return email.length > 0 && !webByEmail.has(email);
  });
  const webOnlyRows = webRows.filter((row) => {
    const email = normalizeEmail(row.Email);
    return email.length > 0 && !explorerByEmail.has(email);
  });
  const eligibleStillOnWebRows = explorerRows.filter((row) => {
    const email = normalizeEmail(row.Email);
    return email.length > 0 && isYes(row.Elegivelexclusao) && webByEmail.has(email);
  });
  const inBoth = explorerRows.filter((row) => {
    const email = normalizeEmail(row.Email);
    return email.length > 0 && webByEmail.has(email);
  }).length;

  return {
    inBoth,
    explorerOnly: explorerOnlyRows.length,
    webOnly: webOnlyRows.length,
    eligibleInExplorerAndPresentOnWeb: eligibleStillOnWebRows.length,
    explorerWithoutEmail: explorerRows.filter((row) => !normalizeEmail(row.Email)).length,
    explorerOnlyRows,
    webOnlyRows,
    eligibleStillOnWebRows,
  };
}

export function formatProjectWiseDate(value: unknown): string {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())
        ? Number(value.trim().replace(',', '.'))
        : null;

  if (numericValue !== null && Number.isFinite(numericValue)) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + numericValue * 24 * 60 * 60 * 1000);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    }
  }

  const text = normalizeText(value);

  if (!text) {
    return '-';
  }

  if (text.toLowerCase() === 'sem registro') {
    return 'Sem registro';
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
