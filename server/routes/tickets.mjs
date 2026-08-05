import { Router } from 'express';
import { requireAdmin, requireUser } from '../auth.mjs';
import { query } from '../db.mjs';

const router = Router();
router.use(requireUser, requireAdmin);

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function date(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Data inválida: ${normalized}`);
  return parsed.toISOString();
}

function ticketValues(body) {
  const openedAt = date(body.openedAt);
  const closedAt = date(body.closedAt);
  if (!openedAt) throw new Error('Informe a data de abertura.');
  if (closedAt && new Date(closedAt) < new Date(openedAt)) {
    throw new Error('A data de fechamento não pode ser anterior à abertura.');
  }
  return [
    text(body.caseNumber), text(body.status) ?? 'Novo', text(body.reason), openedAt,
    date(body.updatedAt), closedAt, text(body.priority), text(body.requester),
    text(body.requesterOrganization), text(body.assignedAgent), text(body.assignedTo),
    text(body.assignedGroup), text(body.ticketType), text(body.slaStatus),
    text(body.beneficiaryOrganization), text(body.requestedFor),
  ];
}

router.post('/', async (request, response) => {
  const values = ticketValues(request.body);
  const result = await query(
    `insert into tickets (
       case_number,status,reason,opened_at,updated_at,closed_at,priority,requester,
       requester_organization,assigned_agent,assigned_to,assigned_group,ticket_type,sla_status,
       beneficiary_organization,requested_for,created_by,updated_by
     ) values (${values.map((_, index) => `$${index + 1}`).join(',')},$17,$17)
     returning *`,
    [...values, request.user.id],
  );
  response.status(201).json(result.rows[0]);
});

router.patch('/', async (request, response) => {
  const id = text(request.body?.id);
  if (!id) {
    response.status(400).json({ error: 'ID do chamado ausente.' });
    return;
  }
  const values = ticketValues(request.body);
  const assignments = [
    'case_number','status','reason','opened_at','updated_at','closed_at','priority','requester',
    'requester_organization','assigned_agent','assigned_to','assigned_group','ticket_type','sla_status',
    'beneficiary_organization','requested_for',
  ].map((column, index) => `${column}=$${index + 1}`);
  const result = await query(
    `update tickets set ${assignments.join(',')}, updated_by=$17, updated_at_system=now()
      where id=$18 returning *`,
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
  const result = await query('delete from tickets where id=$1 returning id', [id]);
  if (!result.rows[0]) {
    response.status(404).json({ error: 'Chamado não encontrado.' });
    return;
  }
  response.json(result.rows[0]);
});

export default router;
