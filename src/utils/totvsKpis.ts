export interface TotvsCategory {
  label: string;
  count: number;
}

export interface TotvsMonthlySnapshot {
  report_period: string;
  imported_at: string;
  categories?: TotvsCategory[];
}

export function getTotvsMonthlySeries(rows: TotvsMonthlySnapshot[], endPeriod: string) {
  const byMonth = new Map<string, TotvsMonthlySnapshot>();
  for (const row of [...rows].sort((a,b) => b.imported_at.localeCompare(a.imported_at))) {
    if (row.report_period <= endPeriod && !byMonth.has(row.report_period)) byMonth.set(row.report_period, row);
  }
  const first = [...byMonth.keys()].sort()[0];
  if (!first) return [];
  const end = new Date(`${endPeriod}-01T00:00:00Z`);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 11);
  const result = [];
  for (const date = new Date(start); date <= end; date.setUTCMonth(date.getUTCMonth() + 1)) {
    const period = date.toISOString().slice(0,7);
    if (period < first) continue;
    const row = byMonth.get(period);
    result.push({ period, hasImport: Boolean(row), opened: row ? getTotvsCategories(row.categories ?? []).identifiedOpened : undefined });
  }
  return result;
}

// Only the category export identifies the system. Never filter aggregate
// company, SLA or backlog reports by a category's proportion of the total.
export function getTotvsCategories(categories: TotvsCategory[] = []) {
  const items = categories
    .filter(row => /(^|[^a-z0-9])totvs(?=$|[^a-z0-9])/i.test(row.label))
    .map(row => ({ ...row }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  return {
    items,
    identifiedOpened: items.length ? items.reduce((sum, row) => sum + row.count, 0) : undefined,
  };
}
