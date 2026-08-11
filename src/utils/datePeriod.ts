export type DatePeriodPreset = 'currentMonth' | 'last3Months' | 'last12Months' | 'all';

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function monthPeriod(anchor: Date, endAtToday: boolean) {
  const today = new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = endAtToday
    ? today
    : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

export function getDefaultDatePeriod(maxDate?: string) {
  const today = new Date();
  const latestDate = parseDate(maxDate);
  const hasCurrentMonthData =
    latestDate &&
    latestDate.getFullYear() === today.getFullYear() &&
    latestDate.getMonth() === today.getMonth();

  return hasCurrentMonthData || !latestDate
    ? { ...monthPeriod(today, true), usedLatestAvailableMonth: false }
    : { ...monthPeriod(latestDate, false), usedLatestAvailableMonth: true };
}

export function getDatePeriodPreset(
  preset: DatePeriodPreset,
  range: { minDate?: string; maxDate?: string },
) {
  const today = new Date();

  if (preset === 'all') {
    return { startDate: range.minDate ?? '', endDate: range.maxDate ?? '' };
  }

  if (preset === 'currentMonth') {
    return monthPeriod(today, true);
  }

  const months = preset === 'last3Months' ? 3 : 12;
  const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
  return { startDate: formatDate(start), endDate: formatDate(today) };
}
