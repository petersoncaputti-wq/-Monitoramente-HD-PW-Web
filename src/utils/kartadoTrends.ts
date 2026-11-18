import type { AuditItem } from '../services/kartadoAuditService';

// Séries temporais dos apontamentos. Datas são 'AAAA-MM-DD' (dia civil, sem fuso);
// a aritmética usa UTC para que horário de verão e fuso do navegador não desloquem dias.
export type TrendPoint = { key: string; label: string; full: string; value: number; value2?: number };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAY = 86_400_000;

export function validDate(value: string | null | undefined): value is string {
  return (
    Boolean(value) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value!) &&
    Number.isFinite(Date.parse(value!)) &&
    new Date(value!).toISOString().slice(0, 10) === value
  );
}
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const br = (date: string) => `${dm(date)}/${date.slice(0, 4)}`;
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthKey = (index: number) =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
const monthLabel = (index: number) => `${MONTHS[index % 12]}/${String(Math.floor(index / 12)).slice(2)}`;
const monthFull = (index: number) => `${MONTHS[index % 12]}/${Math.floor(index / 12)}`;

function count(items: AuditItem[], field: 'dataCriacao' | 'dataExecucao', bucket: (date: string) => string) {
  const counts = new Map<string, number>();
  let invalid = 0;
  for (const item of items) {
    const date = item[field];
    if (!validDate(date)) {
      invalid++;
      continue;
    }
    const key = bucket(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { counts, invalid };
}

/** Criados por mês, do primeiro ao último mês com registro; meses intermediários entram com zero. */
export function monthlyTrend(items: AuditItem[]) {
  const { counts, invalid } = count(items, 'dataCriacao', (date) => date.slice(0, 7));
  const keys = [...counts.keys()].sort();
  const points: TrendPoint[] = [];
  if (keys.length) {
    for (let index = monthIndex(`${keys[0]}-01`); index <= monthIndex(`${keys[keys.length - 1]}-01`); index++) {
      const key = monthKey(index);
      points.push({
        key,
        label: `${key.slice(5)}/${key.slice(0, 4)}`,
        full: monthFull(index),
        value: counts.get(key) || 0,
      });
    }
  }
  return { points, undated: invalid };
}

/** Criados por dia nos `days` dias que terminam em `today`, inclusive. */
export function dailyTrend(items: AuditItem[], today: string, days = 30) {
  const { counts } = count(items, 'dataCriacao', (date) => date);
  const end = toTime(today);
  const weekday = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return Array.from({ length: days }, (_, offset): TrendPoint => {
    const time = end - (days - 1 - offset) * DAY;
    const key = toDate(time);
    return {
      key,
      label: dm(key),
      full: `${weekday[new Date(time).getUTCDay()]} ${br(key)}`,
      value: counts.get(key) || 0,
    };
  });
}

/** Criados por semana (segunda a domingo), nas `weeks` semanas que terminam na semana de `today`. */
export function weeklyTrend(items: AuditItem[], today: string, weeks = 12) {
  const monday = (date: string) => {
    const time = toTime(date);
    return toDate(time - ((new Date(time).getUTCDay() + 6) % 7) * DAY);
  };
  const { counts } = count(items, 'dataCriacao', monday);
  const current = toTime(monday(today));
  return Array.from({ length: weeks }, (_, offset): TrendPoint => {
    const key = toDate(current - (weeks - 1 - offset) * 7 * DAY);
    const last = offset === weeks - 1;
    return {
      key,
      label: `${dm(key)}${last ? '*' : ''}`,
      full: `Semana de ${br(key)}${last ? ' (em andamento)' : ''}`,
      value: counts.get(key) || 0,
    };
  });
}

/** Criados por trimestre, nos `quarters` trimestres que terminam no trimestre de `today`. */
export function quarterlyTrend(items: AuditItem[], today: string, quarters = 8) {
  const quarterIndex = (date: string) => Number(date.slice(0, 4)) * 4 + Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  const { counts } = count(items, 'dataCriacao', (date) => String(quarterIndex(date)));
  const current = quarterIndex(today);
  return Array.from({ length: quarters }, (_, offset): TrendPoint => {
    const index = current - (quarters - 1 - offset);
    const year = Math.floor(index / 4);
    const last = index === current;
    return {
      key: `${year}-T${(index % 4) + 1}`,
      label: `${(index % 4) + 1}T/${String(year).slice(2)}${last ? '*' : ''}`,
      full: `${(index % 4) + 1}º trimestre de ${year}${last ? ' (em andamento)' : ''}`,
      value: counts.get(String(index)) || 0,
    };
  });
}

/** Criados por ano, do primeiro ano com registro até o ano de `today`. */
export function yearlyTrend(items: AuditItem[], today: string) {
  const { counts } = count(items, 'dataCriacao', (date) => date.slice(0, 4));
  const current = Number(today.slice(0, 4));
  const first = Math.min(current, ...[...counts.keys()].map(Number));
  return Array.from({ length: current - first + 1 }, (_, offset): TrendPoint => {
    const year = first + offset;
    const last = year === current;
    return {
      key: String(year),
      label: `${year}${last ? '*' : ''}`,
      full: `${year}${last ? ` (até ${br(today)})` : ''}`,
      value: counts.get(String(year)) || 0,
    };
  });
}

/**
 * Por mês, nos `months` meses que terminam no mês de `today`: `value` = criados no mês
 * (data de criação) e `value2` = executados no mês (data de execução).
 */
export function executionTrend(items: AuditItem[], today: string, months = 6) {
  const created = count(items, 'dataCriacao', (date) => date.slice(0, 7)).counts;
  const executed = count(items, 'dataExecucao', (date) => date.slice(0, 7)).counts;
  const current = monthIndex(today);
  return Array.from({ length: months }, (_, offset): TrendPoint => {
    const index = current - (months - 1 - offset);
    const key = monthKey(index);
    return {
      key,
      label: monthLabel(index),
      full: `${monthFull(index)}${index === current ? ' (em andamento)' : ''}`,
      value: created.get(key) || 0,
      value2: executed.get(key) || 0,
    };
  });
}
