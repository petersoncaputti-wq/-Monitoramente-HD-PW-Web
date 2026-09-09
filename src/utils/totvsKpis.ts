export interface TotvsCategory {
  label: string;
  count: number;
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
