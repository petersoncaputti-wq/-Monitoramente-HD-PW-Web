import { requireAdmin, requireUser } from './_auth.mjs';
import { query } from './_database.mjs';

const COLUMNS = [
  'assigned_agent', 'assigned_group', 'assigned_to', 'beneficiary_organization',
  'case_number', 'closed_at', 'opened_at', 'priority', 'reason', 'requested_for',
  'requester', 'requester_organization', 'sla_status', 'status', 'ticket_type', 'updated_at',
];

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`Data invalida: ${text}`);
  return date.toISOString();
}

function mapInput(body) {
  const openedAt = cleanDate(body.openedAt);
  const closedAt = cleanDate(body.closedAt);
  if (!openedAt) throw new Error('Informe a data de abertura.');
  if (closedAt && new Date(closedAt) < new Date(openedAt)) {
    throw new Error('A data de fechamento nao pode ser anterior a abertura.');
  }
  return {
    assigned_agent: cleanText(body.assignedAgent), assigned_group: cleanText(body.assignedGroup),
    assigned_to: cleanText(body.assignedTo), beneficiary_organization: cleanText(body.beneficiaryOrganization),
    case_number: cleanText(body.caseNumber), closed_at: closedAt, opened_at: openedAt,
    priority: cleanText(body.priority), reason: cleanText(body.reason), requested_for: cleanText(body.requestedFor),
    requester: cleanText(body.requester), requester_organization: cleanText(body.requesterOrganization),
    sla_status: cleanText(body.slaStatus), status: cleanText(body.status) ?? 'Novo',
    ticket_type: cleanText(body.ticketType), updated_at: cleanDate(body.updatedAt),
  };
}

async function listTickets(params) {
  const limit = Math.min(Math.max(Number(params.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const result = await query('select * from tickets order by opened_at desc limit $1 offset $2', [limit, offset]);
  return { body: result.rows, status: 200 };
}

async function createTicket(body, caller) {
  const input = mapInput(body);
  const values = COLUMNS.map((column) => input[column]);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await query(
    `insert into tickets (${COLUMNS.join(', ')}, created_by, updated_by)
     values (${placeholders.join(', ')}, $${values.length + 1}, $${values.length + 1}) returning *`,
    [...values, caller.id],
  );
  return { body: result.rows[0], status: 201 };
}

async function updateTicket(body, caller) {
  const id = cleanText(body.id);
  if (!id) return { error: 'ID do chamado ausente.', status: 400 };
  const input = mapInput(body);
  const values = COLUMNS.map((column) => input[column]);
  const assignments = COLUMNS.map((column, index) => `${column} = $${index + 2}`);
  const result = await query(
    `update tickets set ${assignments.join(', ')}, updated_by = $${values.length + 2}
      where id = $1 returning *`,
    [id, ...values, caller.id],
  );
  return result.rows[0] ? { body: result.rows[0], status: 200 } : { error: 'Chamado nao encontrado.', status: 404 };
}

async function deleteTicket(body) {
  const id = cleanText(body.id);
  if (!id) return { error: 'ID do chamado ausente.', status: 400 };
  const result = await query('delete from tickets where id = $1 returning id', [id]);
  return result.rows[0] ? { body: result.rows[0], status: 200 } : { error: 'Chamado nao encontrado.', status: 404 };
}

export async function handleTicketsRequest({ body = {}, headers = {}, method, query: params = {} }) {
  const auth = method === 'GET' ? await requireUser(headers) : await requireAdmin(headers);
  if (auth.error) return auth;
  if (method === 'GET') return listTickets(params);
  if (method === 'POST') return createTicket(body, auth.caller);
  if (method === 'PATCH') return updateTicket(body, auth.caller);
  if (method === 'DELETE') return deleteTicket(body);
  return { error: 'Metodo nao permitido.', status: 405 };
}

export default async function handler(request, response) {
  try {
    const result = await handleTicketsRequest(request);
    response.status(result.status).json(result.error ? { error: result.error } : result.body);
  } catch (error) {
    const status = error?.code === '23505' ? 409 : 500;
    response.status(status).json({ error: status === 409 ? 'Numero de caso ja cadastrado.' : error.message });
  }
}
