export interface KartadoKpiTicket {
  opened_at: string;
  closed_at: string | null;
  status: string;
  kartado_case_number: string;
  subject: string;
}

// Expediente do ProjectWise: segunda a sexta, 08–12h e 13–17h.
// Datas são avaliadas no fuso de São Paulo (UTC-3).
export function getKartadoBusinessHours(start: string, end: string) {
  const offset = 3 * 3600000;
  const from = Date.parse(start) - offset, to = Date.parse(end) - offset;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  let milliseconds = 0;
  const cursor = new Date(from); cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= to) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      for (const [open, close] of [[8, 12], [13, 17]]) {
        const base = cursor.getTime();
        milliseconds += Math.max(0, Math.min(to, base + close * 3600000) - Math.max(from, base + open * 3600000));
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return milliseconds / 3600000;
}

export function formatKartadoDuration(hours: number | null) {
  if (hours === null) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60).toLocaleString('pt-BR')}h ${minutes % 60}min`;
}

export function getKartadoTicketsKpis(rows: KartadoKpiTicket[], now = new Date()) {
  const pending = rows.filter(row => row.status !== 'Encerrado');
  const closed = rows.filter(row => row.status === 'Encerrado');
  const escalated = rows.filter(row => Boolean(row.kartado_case_number?.trim()));
  const slaDurations = closed.flatMap(row => {
    const hours = row.closed_at ? getKartadoBusinessHours(row.opened_at, row.closed_at) : null;
    return hours === null ? [] : [hours];
  });
  const slaWithin = slaDurations.filter(hours => hours <= 8).length;
  const overduePending = pending.filter(row => {
    const hours = getKartadoBusinessHours(row.opened_at, now.toISOString());
    return hours !== null && hours > 8;
  }).length;
  const durations = closed.flatMap(row => {
    const hours = row.closed_at ? (Date.parse(row.closed_at) - Date.parse(row.opened_at)) / 3600000 : NaN;
    return Number.isFinite(hours) && hours >= 0 ? [hours] : [];
  }).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length ? (durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2) : null;
  const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((counts, label) => {
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  const aging = [
    { label: 'Até 2 dias', count: 0 }, { label: 'Mais de 2 até 7 dias', count: 0 },
    { label: 'Mais de 7 até 30 dias', count: 0 }, { label: 'Mais de 30 dias', count: 0 },
  ];
  pending.forEach(row => {
    const days = (now.getTime() - Date.parse(row.opened_at)) / 86400000;
    if (Number.isFinite(days) && days >= 0) aging[days <= 2 ? 0 : days <= 7 ? 1 : days <= 30 ? 2 : 3].count++;
  });
  const resolution = [{ label: 'Até 8h', count: 0 }, { label: 'Mais de 8 até 24h', count: 0 }, { label: 'Mais de 24 até 72h', count: 0 }, { label: 'Mais de 72h', count: 0 }];
  durations.forEach(hours => resolution[hours <= 8 ? 0 : hours <= 24 ? 1 : hours <= 72 ? 2 : 3].count++);
  const monthKey = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  const events = rows.flatMap(row => [monthKey(row.opened_at), ...(row.status === 'Encerrado' && row.closed_at ? [monthKey(row.closed_at)] : [])]).filter(Boolean).sort();
  const monthly: Array<{ label: string; opened: number; closed: number }> = [];
  if (events.length) {
    const last = new Date(`${events[events.length - 1]}-01T12:00:00`);
    const first = new Date(`${events[0]}-01T12:00:00`);
    const start = new Date(last); start.setMonth(start.getMonth() - 11);
    for (const date = new Date(Math.max(first.getTime(), start.getTime())); date <= last; date.setMonth(date.getMonth() + 1)) {
      const key = monthKey(date.toISOString());
      monthly.push({ label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), opened: rows.filter(row => monthKey(row.opened_at) === key).length, closed: closed.filter(row => row.closed_at && monthKey(row.closed_at) === key).length });
    }
  }
  return { slaWithin, slaApplicable: slaDurations.length, slaPercent: slaDurations.length ? slaWithin / slaDurations.length * 100 : null, overduePending,
    total: rows.length, pending: pending.length, closed: closed.length, escalated: escalated.length,
    escalatedPending: escalated.filter(row => row.status !== 'Encerrado').length,
    escalatedPercent: rows.length ? escalated.length / rows.length * 100 : 0,
    average: durations.length ? durations.reduce((sum, hours) => sum + hours, 0) / durations.length : null,
    median, validDurations: durations.length, aging, resolution, monthly,
    statuses: countBy(rows.map(row => row.status)),
    subjects: countBy(rows.map(row => row.subject.trim() || 'Sem assunto')),
  };
}
