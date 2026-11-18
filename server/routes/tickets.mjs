import { Router } from 'express';
import { requireAdmin, requireUser } from '../auth.mjs';
import { query } from '../db.mjs';
import { badRequest } from '../http-error.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function date(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Data inválida: ${normalized}`);
  return parsed.toISOString();
}

export function ticketValues(body = {}) {
  const openedAt = date(body.openedAt);
  const closedAt = date(body.closedAt);
  if (!openedAt) throw badRequest('Informe a data de abertura.');
  if (closedAt && new Date(closedAt) < new Date(openedAt)) {
    throw badRequest('A data de fechamento não pode ser anterior à abertura.');
  }
  return [
    text(body.caseNumber),
    text(body.status) ?? 'Novo',
    text(body.reason),
    openedAt,
    date(body.updatedAt),
    closedAt,
    text(body.requester),
    text(body.requesterOrganization),
    text(body.assignedAgent),
    text(body.assignedTo),
    text(body.assignedGroup),
    text(body.ticketType),
    text(body.slaStatus),
    text(body.beneficiaryOrganization),
    text(body.requestedFor),
  ];
}

export function createTicketsRouter({ execute = query, authenticate = requireUser, admin = requireAdmin } = {}) {
  const router = Router();
  router.use(authenticate, admin);

  router.post('/', async (request, response) => {
    const values = ticketValues(request.body);
    const result = await execute(
      `insert into tickets (
       case_number,status,reason,opened_at,updated_at,closed_at,requester,
       requester_organization,assigned_agent,assigned_to,assigned_group,ticket_type,sla_status,
       beneficiary_organization,requested_for,created_by,updated_by
     ) values (${values.map((_, index) => `$${index + 1}`).join(',')},$16,$16)
     returning *`,
      [...values, request.user.id],
    );
    response.status(201).json(result.rows[0]);
  });

  router.patch('/', async (request, response) => {
    const id = text(request.body?.id);
    if (!id || !UUID.test(id)) throw badRequest('ID do chamado ausente ou inválido.');
    const values = ticketValues(request.body);
    const assignments = [
      'case_number',
      'status',
      'reason',
      'opened_at',
      'updated_at',
      'closed_at',
      'requester',
      'requester_organization',
      'assigned_agent',
      'assigned_to',
      'assigned_group',
      'ticket_type',
      'sla_status',
      'beneficiary_organization',
      'requested_for',
    ].map((column, index) => `${column}=$${index + 1}`);
    const result = await execute(
      `update tickets set ${assignments.join(',')}, updated_by=$16, updated_at_system=now()
      where id=$17 returning *`,
      [...values, request.user.id, id],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    response.json(result.rows[0]);
  });

  router.delete('/', async (request, response) => {
    const id = text(request.body?.id);
    if (!id || !UUID.test(id)) throw badRequest('ID do chamado ausente ou inválido.');
    const result = await execute('delete from tickets where id=$1 returning id', [id]);
    if (!result.rows[0]) {
      response.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    response.json(result.rows[0]);
  });

  return router;
}

export default createTicketsRouter();
