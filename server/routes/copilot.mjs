import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.mjs';

const router = Router();
const limiter = rateLimit({
  legacyHeaders: false,
  limit: 120,
  message: { error: 'Limite de consultas excedido.' },
  standardHeaders: true,
  windowMs: 60 * 1000,
});

function keyDigest(value) {
  return createHash('sha256').update(String(value ?? '')).digest();
}

function authenticate(request, response, next) {
  const configured = process.env.COPILOT_API_KEY;
  const supplied = request.headers['x-copilot-key'];
  if (!configured || typeof supplied !== 'string') {
    response.status(401).json({ error: 'Credencial do agente ausente.' });
    return;
  }
  if (!timingSafeEqual(keyDigest(configured), keyDigest(supplied))) {
    response.status(403).json({ error: 'Credencial do agente inválida.' });
    return;
  }
  next();
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function date(value) {
  const normalized = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

async function overview() {
  const result = await query(`
    select
      (select count(*)::int from storage_readings) as storage_readings,
      (select max(observed_at) from storage_readings) as latest_storage_reading,
      (select count(*)::int from tickets) as tickets,
      (select count(*)::int from tickets where lower(status) not in ('fechado','closed','resolvido','resolved')) as open_tickets,
      (select count(*)::int from pw_explorer_users) as explorer_users,
      (select count(*)::int from pw_portal_users) as portal_users
  `);
  return { area: 'overview', summary: result.rows[0] };
}

async function storage(input) {
  const from = date(input.dateFrom);
  const to = date(input.dateTo);
  const result = await query(
    `with filtered as (
       select * from storage_readings
        where ($1::date is null or reading_date >= $1)
          and ($2::date is null or reading_date <= $2)
     ), latest as (
       select * from filtered order by observed_at desc limit 1
     )
     select
       (select count(*)::int from filtered) as records,
       (select min(observed_at) from filtered) as first_observation,
       (select max(observed_at) from filtered) as last_observation,
       (select total_gb::double precision from latest) as total_gb,
       (select used_gb::double precision from latest) as used_gb,
       (select free_gb::double precision from latest) as free_gb,
       (select percent_used::double precision from latest) as percent_used,
       (select percent_free::double precision from latest) as percent_free`,
    [from, to],
  );
  const trend = await query(
    `select reading_date::text as date,
            max(used_gb)::double precision as used_gb,
            max(free_gb)::double precision as free_gb,
            max(percent_used)::double precision as percent_used
       from storage_readings
      where ($1::date is null or reading_date >= $1)
        and ($2::date is null or reading_date <= $2)
      group by reading_date order by reading_date desc limit 31`,
    [from, to],
  );
  return { area: 'storage', filters: { dateFrom: from, dateTo: to }, summary: result.rows[0], recentDailyTrend: trend.rows };
}

async function tickets(input) {
  const from = date(input.dateFrom);
  const to = date(input.dateTo);
  const search = text(input.search);
  const status = text(input.status, 80);
  const priority = text(input.priority, 80);
  const params = [from, to, search || null, status || null, priority || null];
  const where = `where ($1::date is null or opened_at::date >= $1)
                   and ($2::date is null or opened_at::date <= $2)
                   and ($3::text is null or concat_ws(' ',case_number,reason,requester,assigned_agent,assigned_group) ilike '%' || $3 || '%')
                   and ($4::text is null or status ilike $4)
                   and ($5::text is null or priority ilike $5)`;
  const summary = await query(
    `select count(*)::int as total,
            count(*) filter (where lower(status) in ('fechado','closed','resolvido','resolved'))::int as closed,
            count(*) filter (where lower(status) not in ('fechado','closed','resolvido','resolved'))::int as open,
            min(opened_at) as first_opened_at, max(opened_at) as last_opened_at
       from tickets ${where}`,
    params,
  );
  const byStatus = await query(`select coalesce(status,'Não informado') as label,count(*)::int as total from tickets ${where} group by status order by total desc`, params);
  const byPriority = await query(`select coalesce(priority,'Não informada') as label,count(*)::int as total from tickets ${where} group by priority order by total desc`, params);
  const records = await query(
    `select case_number,status,reason,opened_at,updated_at,closed_at,priority,requester,assigned_agent,assigned_group,sla_status
       from tickets ${where} order by opened_at desc limit 50`,
    params,
  );
  return { area: 'tickets', breakdown: { priority: byPriority.rows, status: byStatus.rows }, filters: { dateFrom: from, dateTo: to, priority, search, status }, records: records.rows, summary: summary.rows[0] };
}

async function explorer(input) {
  const search = text(input.search);
  const result = await query(
    `select nome,email,pw_id,status,status_acesso,status_projectwise,elegivel_exclusao,ultimo_acesso,motivo
       from pw_explorer_users
      where ($1::text is null or concat_ws(' ',nome,email,pw_id,status,status_acesso,status_projectwise,elegivel_exclusao,motivo) ilike '%' || $1 || '%')
      order by nome asc nulls last limit 100`,
    [search || null],
  );
  const summary = await query(`select count(*)::int as total,
    count(*) filter (where lower(coalesce(elegivel_exclusao,'')) in ('sim','yes','true'))::int as eligible_for_deletion
    from pw_explorer_users`);
  const byStatus = await query(`select coalesce(status,'Não informado') as label,count(*)::int as total from pw_explorer_users group by status order by total desc`);
  return { area: 'explorer_users', breakdown: { status: byStatus.rows }, filters: { search }, records: result.rows, summary: summary.rows[0] };
}

async function portal(input) {
  const search = text(input.search);
  const result = await query(
    `select email,first_name,last_name,company_name,job_title,locked,mfa,last_login_date,roles
       from pw_portal_users
      where ($1::text is null or concat_ws(' ',email,first_name,last_name,company_name,job_title,locked,mfa,roles) ilike '%' || $1 || '%')
      order by email asc nulls last limit 100`,
    [search || null],
  );
  const summary = await query(`select count(*)::int as total,
    count(*) filter (where lower(coalesce(locked,'')) in ('sim','yes','true','locked'))::int as locked,
    count(*) filter (where lower(coalesce(mfa,'')) in ('sim','yes','true','enabled','ativo'))::int as mfa_enabled
    from pw_portal_users`);
  return { area: 'portal_users', filters: { search }, records: result.rows, summary: summary.rows[0] };
}

router.post('/analytics', limiter, authenticate, async (request, response) => {
  const area = text(request.body?.area, 40).toLowerCase();
  const handlers = { overview, storage, tickets, explorer, portal };
  const handler = handlers[area];
  if (!handler) {
    response.status(400).json({ error: 'Área inválida. Use overview, storage, tickets, explorer ou portal.' });
    return;
  }
  response.json(await handler(request.body ?? {}));
});

export default router;
