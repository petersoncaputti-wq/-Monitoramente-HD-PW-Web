import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.mjs';
import {
  getToken,
  listCompanies,
  listUsers,
  listReportings,
  listInventoryCounts,
  listJobProgress,
  listFirmCounts,
  listPhotosForCompany,
} from '../services/kartado.service.mjs';
import { buildConcessaoDashboard } from '../services/kartado-analytics.service.mjs';

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

router.get('/openapi.json', (request, response) => {
  const baseUrl = `${request.protocol}://${request.get('host')}`;
  response.json({
    openapi: '3.0.3',
    info: {
      title: 'Painel de Sistemas de Engenharia - Copilot API',
      version: '1.0.0',
      description: 'Ferramentas somente leitura para consultar ProjectWise, E365 e Kartado.',
    },
    servers: [{ url: `${baseUrl}/api/copilot` }],
    paths: {
      '/analytics': {
        post: {
          operationId: 'consultarDadosEngenharia',
          summary: 'Consulta dados operacionais dos sistemas de engenharia',
          description: 'Escolha uma área e envie filtros opcionais. Para Kartado, consulte primeiro sem company para obter as unidades e depois informe UUID ou nome.',
          security: [{ CopilotApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['area'],
                  properties: {
                    area: { type: 'string', enum: ['overview', 'storage', 'tickets', 'explorer', 'portal', 'e365', 'kartado'], description: 'Fonte de dados a consultar.' },
                    company: { type: 'string', description: 'Nome ou UUID da unidade Kartado.' },
                    search: { type: 'string', maxLength: 200, description: 'Texto para pesquisar registros.' },
                    status: { type: 'string', maxLength: 80 },
                    priority: { type: 'string', maxLength: 80 },
                    dateFrom: { type: 'string', format: 'date' },
                    dateTo: { type: 'string', format: 'date' },
                    quarter: { type: 'string', maxLength: 20, description: 'Quarter E365.' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Resultado da consulta.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            400: { description: 'Parâmetros inválidos.' },
            401: { description: 'Chave ausente.' },
            403: { description: 'Chave inválida.' },
            429: { description: 'Limite de consultas excedido.' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        CopilotApiKey: { type: 'apiKey', in: 'header', name: 'x-copilot-key' },
      },
    },
  });
});

async function e365(input) {
  const search = text(input.search);
  const quarter = text(input.quarter, 20);
  const params = [search || null, quarter || null];
  const summary = await query(
    `select count(*)::int as total,
            count(distinct ims_id)::int as distinct_users,
            count(distinct product_id)::int as distinct_products,
            coalesce(sum(net_amount),0)::double precision as net_amount
       from e365_usage
      where ($1::text is null or concat_ws(' ',account_name,persona_email,product_name,ims_id) ilike '%' || $1 || '%')
        and ($2::text is null or usage_quarter = $2)`,
    params,
  );
  const byProduct = await query(
    `select product_name as label,count(*)::int as total,
            coalesce(sum(net_amount),0)::double precision as net_amount
       from e365_usage
      where ($1::text is null or concat_ws(' ',account_name,persona_email,product_name,ims_id) ilike '%' || $1 || '%')
        and ($2::text is null or usage_quarter = $2)
      group by product_name order by total desc limit 30`,
    params,
  );
  const records = await query(
    `select account_name,persona_email,product_name,connection_status,usage_date,
            usage_quarter,currency,net_amount::double precision as net_amount
       from e365_usage
      where ($1::text is null or concat_ws(' ',account_name,persona_email,product_name,ims_id) ilike '%' || $1 || '%')
        and ($2::text is null or usage_quarter = $2)
      order by usage_quarter desc,persona_email asc nulls last limit 100`,
    params,
  );
  return { area: 'e365', filters: { quarter, search }, summary: summary.rows[0], breakdown: { products: byProduct.rows }, records: records.rows };
}

function kartadoCredentials() {
  const username = process.env.KARTADO_USERNAME?.trim();
  const password = process.env.KARTADO_PASSWORD;
  if (!username || !password) throw Object.assign(new Error('Integração Kartado não configurada.'), { status: 503 });
  return { username, password };
}

function resolveCompany(companies, input) {
  if (!input) return null;
  const term = text(input, 200).toLocaleLowerCase('pt-BR');
  const exact = companies.find((company) =>
    company.uuid?.toLowerCase() === term || company.name?.toLocaleLowerCase('pt-BR') === term,
  );
  if (exact) return exact;
  const matches = companies.filter((company) => company.name?.toLocaleLowerCase('pt-BR').includes(term));
  return matches.length === 1 ? matches[0] : null;
}

async function kartado(input) {
  const credentials = kartadoCredentials();
  const auth = await getToken(credentials.username, credentials.password);
  const companies = await listCompanies(auth.token);
  const companyInput = text(input.company, 200);
  if (!companyInput) {
    return { area: 'kartado', requiresCompany: true, companies: companies.map(({ uuid, name }) => ({ uuid, name })) };
  }
  const company = resolveCompany(companies, companyInput);
  if (!company) {
    return { area: 'kartado', requiresCompany: true, message: 'Unidade ausente ou ambígua.', companies: companies.map(({ uuid, name }) => ({ uuid, name })) };
  }
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 86_400_000).toISOString().slice(0, 10);
  const search = text(input.search);
  const [usersResult, reportingsResult, inventoryResult, jobsResult, firmsResult, monthResult, photosResult] = await Promise.allSettled([
    listUsers(auth.token, company.uuid, { pageSize: search ? 100 : 25, search, maxPages: search ? 2 : 1 }),
    listReportings(auth.token, company.uuid, { pageSize: 50 }),
    listInventoryCounts(auth.token, company.uuid),
    listJobProgress(auth.token, company.uuid),
    listFirmCounts(auth.token, company.uuid),
    listReportings(auth.token, company.uuid, { foundAtAfter: startOfMonth, pageSize: 100, maxPages: 3 }),
    listPhotosForCompany(auth.token, company.uuid, { foundAtAfter: fifteenDaysAgo, pageSize: 100, maxPages: 5 }),
  ]);
  const value = (result, fallback) => result.status === 'fulfilled' ? result.value : { ...fallback, error: result.reason?.message };
  const dashboard = buildConcessaoDashboard(
    company,
    value(usersResult, { users: [], totalCount: 0 }),
    value(reportingsResult, { reportings: [], totalCount: 0 }),
    value(inventoryResult, { totalCount: null, withImageCount: null, inventoryItems: [] }),
    value(jobsResult, { totalJobs: null, totalThisMonth: null, dimProgramacoes: null }),
    value(firmsResult, { total: null, firms: [] }),
    value(monthResult, { reportings: [], totalCount: 0 }),
    value(photosResult, { photos: [], reportingUuids: [], totalPhotos: null }),
  );
  return {
    area: 'kartado',
    company: dashboard.company,
    summary: dashboard.summary,
    alerts: dashboard.alerts,
    breakdown: {
      reportingStatus: dashboard.reportings.byStatus,
      reportingTypes: dashboard.reportings.byType,
      roads: dashboard.reportings.byRoad,
      origins: dashboard.reportings.byOrigin,
    },
    users: dashboard.users.users.slice(0, 100),
    reportings: dashboard.reportings.items.slice(0, 100),
  };
}

router.post('/analytics', limiter, authenticate, async (request, response) => {
  const area = text(request.body?.area, 40).toLowerCase();
  const handlers = { overview, storage, tickets, explorer, portal, e365, kartado };
  const handler = handlers[area];
  if (!handler) {
    response.status(400).json({ error: 'Área inválida. Use overview, storage, tickets, explorer, portal, e365 ou kartado.' });
    return;
  }
  try {
    response.json(await handler(request.body ?? {}));
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || 'Falha ao consultar os dados.' });
  }
});

export default router;
