// Campos que descrevem o chamado e não mudam ao longo da vida dele. Na consolidação,
// vale o valor mais recente NÃO VAZIO: um relatório exportado sem as colunas do
// solicitante não apaga a organização gravada por uma importação anterior. Os campos de
// ciclo de vida (Status, Fechadoem, AgenteAtribuído, Motivo...) seguem sempre a
// importação mais recente, mesmo vazios.
export const STABLE_TICKET_FIELDS = [
  'Resumo',
  'Solicitante',
  'Organizaçãodosolicitante',
  'Organizaçãodobeneficiário',
  'Origem',
];
const isBlank = (value) => String(value ?? '').trim() === '';

// Menção textual a TOTVS/TCOP (o mesmo critério do recorte "mentions" do importador).
// É um filtro, não uma classificação definitiva do sistema do chamado.
export function mentionsTotvs(...texts) {
  return /\b(totvs|tcop)\b/i.test(texts.map((text) => String(text ?? '')).join(' '));
}

export function consolidateTotvsImports(rows) {
  const detailed = rows.filter((row) => row.payload?.kind === 'detailed');
  if (!detailed.length) return null;
  const tickets = new Map();
  // Rows are newest first: the latest imported version of each ticket wins, and stable
  // fields left blank by it are filled from older imports.
  for (const { payload } of detailed) {
    for (const ticket of payload.tickets ?? []) {
      const id = String(ticket['Caso n.º'] ?? '').trim();
      if (!id) continue;
      const current = tickets.get(id);
      if (!current) {
        tickets.set(id, { ...ticket });
        continue;
      }
      for (const field of STABLE_TICKET_FIELDS) {
        if (isBlank(current[field]) && !isBlank(ticket[field])) current[field] = ticket[field];
      }
    }
  }
  return {
    id: 'consolidated',
    payload: {
      ...detailed[0].payload,
      scope: detailed.some((row) => row.payload.scope === 'all') ? 'all' : 'mentions',
      sourceCount: tickets.size,
      tickets: [...tickets.values()],
    },
  };
}

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

// Input is ordered by newest import first. A ticket is emitted only once; description and
// organization left blank by the newest import are filled from older imports.
// Options: { system: 'totvs' } keeps only tickets that mention TOTVS/TCOP.
export function mapTotvsImports(rows, { system = '' } = {}) {
  const tickets = new Map();
  for (const row of rows) {
    const id = String(row.ticket_id ?? '').trim();
    if (!id) continue;
    const current = tickets.get(id);
    if (current) {
      if (isBlank(current.description) && !isBlank(row.description)) current.description = row.description;
      if (isBlank(current.requester_organization) && !isBlank(row.requester_organization))
        current.requester_organization = row.requester_organization;
      continue;
    }
    tickets.set(id, {
      ticket_id: id,
      description: row.description ?? '',
      requester_organization: row.requester_organization ?? '',
      opened_at: normalizeTotvsOpenedAt(row.opened_at),
      reason: row.reason ?? '',
    });
  }
  const result = [...tickets.values()].map(({ reason, ...ticket }) => ({
    ...ticket,
    mentions_totvs: mentionsTotvs(ticket.description, reason),
  }));
  return result
    .filter((ticket) => system !== 'totvs' || ticket.mentions_totvs)
    .sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? '') || a.ticket_id.localeCompare(b.ticket_id));
}
