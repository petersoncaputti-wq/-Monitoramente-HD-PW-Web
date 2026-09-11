// The XLSX importer stores Abertoem as local ISO text, without a time zone.
// Preserve its calendar date rather than converting it through the server zone.
export function normalizeTotvsOpenedAt(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

// Input is ordered by newest import first. A ticket is emitted only once.
export function mapTotvsImports(rows) {
  const tickets = new Map();
  for (const row of rows) {
    const id = String(row.ticket_id ?? '').trim();
    if (!id || tickets.has(id)) continue;
    tickets.set(id, {
      ticket_id: id,
      description: row.description ?? '',
      requester_organization: row.requester_organization ?? '',
      opened_at: normalizeTotvsOpenedAt(row.opened_at),
    });
  }
  return [...tickets.values()].sort((a, b) =>
    (b.opened_at ?? '').localeCompare(a.opened_at ?? '') || a.ticket_id.localeCompare(b.ticket_id));
}
