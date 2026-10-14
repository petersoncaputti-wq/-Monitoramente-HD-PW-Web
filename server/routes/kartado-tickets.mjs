import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireUser, requireAdmin } from '../auth.mjs';
import { query } from '../db.mjs';

export function ticketValues(body) {
  const field = (key, required = false) => {
    const value = String(body[key] ?? '').trim();
    if ((required && !value) || value.length > 10000) throw new Error(`Campo inválido: ${key}.`);
    return value;
  };
  const status = field('status', true), priority = field('priority', true);
  if (!['Novo', 'Em atendimento', 'Aguardando', 'Encerrado'].includes(status)) throw new Error('Status inválido.');
  if (!['Baixa', 'Normal', 'Alta', 'Crítica'].includes(priority)) throw new Error('Prioridade inválida.');
  const opened = new Date(body.opened_at);
  if (!body.opened_at || Number.isNaN(opened.getTime()) || opened > new Date()) throw new Error('Informe uma abertura válida, até o momento atual.');
  const closed = status === 'Encerrado' ? new Date(body.closed_at || new Date()) : null;
  if (closed && (Number.isNaN(closed.getTime()) || closed < opened || closed > new Date())) throw new Error('Fechamento inválido.');
  return [field('case_number', true), field('unit_id', true), field('unit_name', true), field('subject', true), field('description'), status, priority, field('requester'), field('responsible'), field('resolution'), opened.toISOString(), closed?.toISOString() ?? null];
}
export function createKartadoTicketsRouter({ execute = query, authenticate = requireUser, admin = requireAdmin } = {}) {
  const router = Router();
  router.use(authenticate);
  router.get('/', async (req, res) => {
    const unit = String(req.query.unit || '').trim();
    const result = await execute(`select * from kartado_tickets ${unit ? 'where unit_id=$1' : ''} order by opened_at desc`, unit ? [unit] : []);
    res.json(result.rows);
  });
  async function save(req, res) {
    let values;
    try { values = ticketValues(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const columns = ['case_number','unit_id','unit_name','subject','description','status','priority','requester','responsible','resolution','opened_at','closed_at'];
    const editing = req.method === 'PATCH';
    if (editing && !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const result = editing
      ? await execute(`update kartado_tickets set ${columns.map((c,i) => `${c}=$${i+1}`).join(',')},updated_at=now(),updated_by=$13 where id=$14 returning *`, [...values, req.user.id, req.params.id])
      : await execute(`insert into kartado_tickets (${columns.join(',')},created_by,updated_by,id) values (${values.map((_,i) => `$${i+1}`).join(',')},$13,$13,$14) returning *`, [...values, req.user.id, randomUUID()]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Chamado não encontrado.' });
    res.status(editing ? 200 : 201).json(result.rows[0]);
  }
  router.post('/', admin, save);
  router.patch('/:id', admin, save);
  router.use((error, _req, res, next) => {
    if (error.code === '42P01') return res.status(503).json({ error: 'A base de chamados Kartado ainda precisa ser preparada.' });
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um chamado com esse número nesta unidade.' });
    next(error);
  });
  return router;
}
export default createKartadoTicketsRouter();
