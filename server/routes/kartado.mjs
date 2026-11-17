/**
 * Kartado Router — /api/v1/kartado/*
 * Fonte única: https://api.kartado.com.br
 * Somente usuários ativos (active=true enviado em toda consulta).
 * Sem mock. Sem dados legados.
 *
 * Segurança: estas rotas usam a conta de serviço do Kartado. Não exponha
 * rotas de depuração que aceitem caminhos/URLs arbitrários ou devolvam
 * tokens (as antigas /inspect, /auth, /diagnose etc. foram removidas).
 */

import { Router } from 'express';
import {
  getToken, listCompanies, listUsers, listReportings, listReportingPage,
  listInventoryCounts, listJobProgress, listFirmCounts,
  loadAllCompanies, listPhotosForCompany,
} from '../services/kartado.service.mjs';
import { buildConcessaoDashboard, buildMultiDashboard, buildReportingMetrics } from '../services/kartado-analytics.service.mjs';
import { createBoundedCache } from '../services/bounded-cache.mjs';

export const kartadoRouter = Router();

const UUID_LIKE = /^[0-9a-f-]{36}$/i;

// Mensagens públicas por status: detalhes do Kartado (caminhos, corpos de
// erro) ficam só no log do servidor. Erros marcados com `expose` são nossos
// e podem ser mostrados como estão.
const UPSTREAM_MESSAGES = {
  404: 'Registro não encontrado no Kartado.',
  429: 'O Kartado limitou as consultas. Aguarde alguns instantes e tente novamente.',
  504: 'O Kartado demorou a responder. Tente novamente.',
};
export function publicKartadoError(err) {
  if (err?.expose) return { status: err.httpStatus, message: err.message };
  const upstream = Number.isInteger(err?.httpStatus) ? err.httpStatus : 0;
  // 401/403 do Kartado não podem chegar ao navegador como 401: isso
  // significaria sessão do painel expirada.
  if (upstream === 401 || upstream === 403) return { status: 502, message: 'A integração Kartado não tem permissão para esta consulta.' };
  if (UPSTREAM_MESSAGES[upstream]) return { status: upstream, message: UPSTREAM_MESSAGES[upstream] };
  return { status: 502, message: 'Falha ao consultar o Kartado. Tente novamente.' };
}
function sendKartadoError(res, err, context, extra = {}) {
  const { status, message } = publicKartadoError(err);
  console.error(`[Kartado/${context}]`, { status: err?.httpStatus ?? null, detail: err?.message ?? String(err) });
  const retry = Number(err?.retryAfter);
  if (Number.isFinite(retry) && retry > 0) res.set('Retry-After', String(Math.ceil(retry)));
  return res.status(status).json({ success: false, error: message, ...extra });
}

const SOURCE = { source: 'api.kartado.com.br — tempo real — somente usuários ativos' };

function requireCreds(_req, res) {
  const username = process.env.KARTADO_USERNAME;
  const password = process.env.KARTADO_PASSWORD;
  if (!username || !password) {
    res.status(503).json({ success: false, error: 'A integração Kartado não está configurada no servidor.' });
    return null;
  }
  return { username, password };
}

function makeLogger(label) {
  const log = [];
  const add = (step, status, msg, ms) => {
    log.push({ step, status, msg, ms: ms ?? null, ts: Date.now() });
    console.log(`[${label}/${step}] ${status.toUpperCase()} ${msg}${ms != null ? ` (${ms}ms)` : ''}`);
  };
  return { log, add };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /companies
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/companies', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  try {
    const { token, user, latencyMs } = await getToken(creds.username, creds.password);
    const companies = await listCompanies(token);
    res.json({ success: true, ...SOURCE, auth: { latencyMs, user: user?.username }, companies, count: companies.length });
  } catch (err) {
    sendKartadoError(res, err, req.path.slice(1));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /search
// Busca usuários por nome, e-mail ou username em uma concessão
// Body: { username, password, companyUuid, query }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/search', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  const { companyUuid, query = '' } = req.body;
  if (!companyUuid) return res.status(400).json({ success: false, error: 'companyUuid é obrigatório.' });
  if (!query.trim()) return res.status(400).json({ success: false, error: 'query não pode estar vazia.' });

  try {
    const { token, latencyMs: authMs } = await getToken(creds.username, creds.password);
    const data = await listUsers(token, companyUuid, { pageSize: 100, search: query.trim() });
    const users = data.users.map(u => {
      const a = u.attributes || u;
      return {
        id:       u.id || a.uuid,
        fullName: a.fullName || a.full_name || `${a.firstName||a.first_name||''} ${a.lastName||a.last_name||''}`.trim() || '—',
        username: a.username || null,
        email:    a.email    || null,
        isSupervisor: a.isSupervisor ?? a.is_supervisor ?? false,
        isInternal:   a.isInternal   ?? a.is_internal   ?? true,
        expirationDate: a.expirationDate || a.expiration_date || null,
      };
    });
    res.json({ success: true, ...SOURCE, auth: { latencyMs: authMs }, query, companyUuid, total: data.totalCount, returned: users.length, users });
  } catch (err) {
    sendKartadoError(res, err, req.path.slice(1));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /reportings
// Busca apontamentos de uma concessão com filtro de data
// Body: { username, password, companyUuid, foundAtAfter?, foundAtBefore?, pageSize? }
// Exemplos: { foundAtAfter: "2025-01-01", foundAtBefore: "2025-01-31" }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/reportings', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  const { companyUuid, foundAtAfter = '', foundAtBefore = '', origin = '', pageSize = 100, maxPages = 2 } = req.body;
  if (!companyUuid) return res.status(400).json({ success: false, error: 'companyUuid é obrigatório.' });

  try {
    const { token, latencyMs: authMs } = await getToken(creds.username, creds.password);
    const requestedPageSize = Math.min(parseInt(pageSize) || 50, 100);
    let data;
    try {
      data = await listReportings(token, companyUuid, {
        pageSize: requestedPageSize,
        foundAtAfter,
        foundAtBefore,
        origin,
        maxPages: Math.min(Math.max(parseInt(maxPages) || 1, 1), 2),
      });
    } catch (initialError) {
      if (requestedPageSize <= 25) throw initialError;
      data = await listReportings(token, companyUuid, {
        pageSize: 25,
        foundAtAfter,
        foundAtBefore,
        origin,
        maxPages: 2,
      });
      console.warn('[Kartado/reportings] consulta reduzida para 25 registros:', initialError?.message);
      data.warning = 'Consulta reduzida para 25 registros após falha na consulta completa.';
    }
    const metrics = buildReportingMetrics(data.reportings, data.totalCount, null, data.isFirstPage);
    res.json({
      success: true, ...SOURCE,
      auth:        { latencyMs: authMs },
      companyUuid,
      filter:      { foundAtAfter, foundAtBefore, origin },
      pagination:  { returned: data.reportings.length, totalApi: data.totalCount, totalPages: data.totalPages, isFirstPage: data.isFirstPage },
      reportings:  data.reportings,
      metrics,
      note: data.isFirstPage
        ? `Exibindo 100 mais recentes. Total na base: ${data.totalCount}. Use foundAtAfter/foundAtBefore para filtrar por período.`
        : `${data.reportings.length} apontamentos retornados para o período ${foundAtAfter || '*'} → ${foundAtBefore || '*'}`,
    });
  } catch (err) {
    sendKartadoError(res, err, req.path.slice(1));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dashboard  — uma concessão
// Body: { username, password, companyUuid?, pageSize? }
// ─────────────────────────────────────────────────────────────────────────────
const DASHBOARD_CACHE_TTL_MS = Number(process.env.KARTADO_CACHE_TTL_MS || 10 * 60 * 1000);
const dashboardCache = createBoundedCache({ max: 100, ttlMs: DASHBOARD_CACHE_TTL_MS });
const healthCache = createBoundedCache({ max: 100, ttlMs: DASHBOARD_CACHE_TTL_MS });
// Consultas em andamento: cada entrada sai ao terminar, então o tamanho é
// limitado pelas requisições simultâneas (e o companyUuid é validado).
const healthInFlight = new Map();

async function loadHealthDashboard(company, credentials) {
  const auth = await getToken(credentials.username, credentials.password);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 86_400_000).toISOString().split('T')[0];
  const [reportingsResult, monthResult, photosResult, jobsResult] = await Promise.allSettled([
    listReportings(auth.token, company.uuid, { pageSize: 25, includeUsage: true }),
    listReportings(auth.token, company.uuid, { foundAtAfter: startOfMonth, pageSize: 100, maxPages: 3, includeUsage: true }),
    listPhotosForCompany(auth.token, company.uuid, { foundAtAfter: fifteenDaysAgo, pageSize: 100, maxPages: 5 }),
    listJobProgress(auth.token, company.uuid),
  ]);
  const reportings = reportingsResult.status === 'fulfilled'
    ? reportingsResult.value
    : { reportings: [], totalCount: 0, error: reportingsResult.reason?.message };
  const reportingsMonth = monthResult.status === 'fulfilled'
    ? monthResult.value
    : { reportings: [], totalCount: 0, error: monthResult.reason?.message };
  const photos = photosResult.status === 'fulfilled'
    ? photosResult.value
    : { photos: [], reportingUuids: [], totalPhotos: null, error: photosResult.reason?.message };
  const jobs = jobsResult.status === 'fulfilled'
    ? jobsResult.value
    : { totalJobs: null, totalThisMonth: null, dimProgramacoes: null, error: jobsResult.reason?.message };
  return buildConcessaoDashboard(
    company,
    { users: [], totalCount: 0 },
    reportings,
    null,
    jobs,
    null,
    reportingsMonth,
    photos,
  );
}

kartadoRouter.post('/health', async (req, res) => {
  const credentials = requireCreds(req, res);
  if (!credentials) return;
  const { companyUuid, companyName, force = false } = req.body || {};
  if (typeof companyUuid !== 'string' || !UUID_LIKE.test(companyUuid)) {
    return res.status(400).json({ success: false, error: 'companyUuid inválido.' });
  }
  const cached = healthCache.get(companyUuid);
  if (!force && cached) {
    return res.json({ success: true, dashboard: cached.value, cache: { hit: true, expiresAt: cached.expiresAt } });
  }
  try {
    let pending = healthInFlight.get(companyUuid);
    if (!pending || force) {
      pending = loadHealthDashboard(
        { uuid: companyUuid, id: companyUuid, name: companyName || companyUuid },
        credentials,
      );
      healthInFlight.set(companyUuid, pending);
      void pending.then(() => {
        if (healthInFlight.get(companyUuid) === pending) healthInFlight.delete(companyUuid);
      }, () => {
        if (healthInFlight.get(companyUuid) === pending) healthInFlight.delete(companyUuid);
      });
    }
    const dashboard = await pending;
    const entry = healthCache.set(companyUuid, dashboard);
    return res.json({ success: true, dashboard, cache: { hit: false, expiresAt: entry.expiresAt } });
  } catch (error) {
    return sendKartadoError(res, error, 'health');
  }
});

kartadoRouter.post('/dashboard', (req, res, next) => {
  const { companyUuid = '', summaryOnly = false, force = false } = req.body || {};
  const cacheKey = `${companyUuid}:${summaryOnly ? 'summary' : 'full'}`;
  const cached = dashboardCache.get(cacheKey);

  if (!force && cached) {
    return res.json({ ...cached.value, cache: { hit: true, expiresAt: cached.expiresAt } });
  }

  // O handler seguinte grava no cache explicitamente ao concluir com sucesso.
  res.locals.dashboardCacheKey = cacheKey;
  next();
});

kartadoRouter.post('/dashboard', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { companyUuid, companyName, concessaoNome, pageSize = 100, summaryOnly = false } = req.body;
  const { log, add } = makeLogger('dash');

  // Detecta se o valor passado é um UUID real (contém '-') ou um nome/texto livre
  const inputIsUuid = companyUuid && companyUuid.includes('-');

  try {
    add('1', 'run', 'POST /token/login/');
    const auth = await getToken(creds.username, creds.password);
    add('1', auth.fromCache ? 'ok' : 'ok', `Autenticado — ${auth.user?.username || creds.username}${auth.fromCache ? ' (token em cache)' : ''}`, auth.latencyMs);

    let companies = [], selected = null;

    if (inputIsUuid) {
      // UUID já conhecido — pula GET /Company/ (economiza 1 request por concessão)
      selected = { uuid: companyUuid, id: companyUuid, name: companyName || companyUuid };
      add('2', 'ok', `Concessão: ${selected.name} (UUID direto)`);
    } else {
      // Sem UUID válido — lista concessões para resolver por nome ou selecionar única
      add('2', 'run', 'GET /Company/ — concessões ativas');
      try {
        companies = await listCompanies(auth.token);
        add('2', 'ok', `${companies.length} concessão(ões) ativa(s)`);

        // Tenta resolver por nome (companyUuid pode ser texto livre vindo do Copilot).
        // Várias concessões começam com "Ecovias" — testar só a 1ª palavra do nome
        // (ex.: searchTerm.includes(primeiraPalavra)) casava com a PRIMEIRA "Ecovias ..."
        // da lista, misturando dados entre unidades (ex.: "Ecovias Noroeste Paulista" vs
        // "... - SIGECON/SIR/SISATIVOS"). Mesma lógica segura em 3 passos usada no
        // Copilot (copilot.router.js#resolveCompany): exato → substring único → todas
        // as palavras (>3 letras) únicas.
        const searchTerm = (companyUuid || concessaoNome || '').toLowerCase().trim();
        if (searchTerm && companies.length > 1) {
          let match = companies.find(c => c.name?.toLowerCase().trim() === searchTerm);

          if (!match) {
            const substringMatches = companies.filter(c => c.name?.toLowerCase().includes(searchTerm));
            if (substringMatches.length === 1) match = substringMatches[0];
          }

          if (!match) {
            const words = searchTerm.split(/\s+/).filter(w => w.length > 3);
            if (words.length) {
              const wordMatches = companies.filter(c => words.every(w => c.name?.toLowerCase().includes(w)));
              if (wordMatches.length === 1) match = wordMatches[0];
            }
          }

          if (match) {
            selected = match;
            add('2', 'ok', `Concessão resolvida por nome: "${searchTerm}" → ${match.name} (${match.uuid})`);
          }
        }

        if (!selected) {
          if (companies.length === 1) {
            selected = companies[0];
            add('2', 'ok', `Única concessão: ${selected.name}`);
          } else if (companies.length > 1) {
            add('2', 'info', `${companies.length} concessões — selecione uma`);
            return res.json({ success: false, requiresCompany: true, companies, log, auth: { latencyMs: auth.latencyMs }, ...SOURCE });
          } else {
            throw { step: 'companies', httpStatus: 404, expose: true, message: 'Nenhuma concessão ativa disponível.' };
          }
        }
      } catch (e) {
        if (e.step === 'companies') throw e;
        add('2', 'warn', `GET /Company/ falhou: ${publicKartadoError(e).message}`);
        throw { ...e, recommendation: 'Forneça companyUuid no body.' };
      }
    }

    const ps = summaryOnly ? 25 : Math.min(parseInt(pageSize) || 100, 100);
    const now2 = new Date();
    const startOfMonth    = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().split('T')[0];
    const quinzeDiasAtras = new Date(now2.getTime() - 15 * 86_400_000).toISOString().split('T')[0];

    add('3', 'run', `${summaryOnly ? 'Carga resumida' : 'Carga completa'} — company=${selected.uuid}`);
    const [uR, rR, invR, jobR, firmR, rMesR, photosR] = await Promise.allSettled([
      listUsers(auth.token, selected.uuid, { pageSize: ps, maxPages: summaryOnly ? 1 : 10 }),
      listReportings(auth.token, selected.uuid, { pageSize: ps, includeUsage: true }),
      summaryOnly ? Promise.resolve({ totalCount: null, withImageCount: null, inventoryItems: [] }) : listInventoryCounts(auth.token, selected.uuid),
      summaryOnly ? Promise.resolve({ totalJobs: null, totalThisMonth: null, avgProgress: null }) : listJobProgress(auth.token, selected.uuid),
      summaryOnly ? Promise.resolve({ total: null, firms: [] }) : listFirmCounts(auth.token, selected.uuid),
      summaryOnly ? Promise.resolve({ reportings: [], totalCount: 0 }) : listReportings(auth.token, selected.uuid, { foundAtAfter: startOfMonth, pageSize: ps, maxPages: 3, includeUsage: true }),
      summaryOnly ? Promise.resolve({ photos: [], reportingUuids: [], totalPhotos: null }) : listPhotosForCompany(auth.token, selected.uuid, { foundAtAfter: quinzeDiasAtras, pageSize: 100, maxPages: 5 }),
    ]);

    const ud = uR.status === 'fulfilled'
      ? uR.value
      : { users: [], totalCount: 0, latencyMs: 0, error: uR.reason?.message };

    let rd;
    if (rR.status === 'fulfilled') {
      rd = rR.value;
    } else {
      try {
        const fallback = await listReportings(auth.token, selected.uuid, { pageSize: 25, includeUsage: true });
        rd = {
          ...fallback,
          warning: `Consulta reduzida após falha na carga de 100 registros: ${rR.reason?.message}`,
        };
      } catch {
        rd = { reportings: [], totalCount: 0, page1Count: 0, totalPages: 0, latencyMs: 0, error: rR.reason?.message };
      }
    }

    const invd    = invR.status    === 'fulfilled' ? invR.value    : { totalCount: null, withImageCount: null, inventoryItems: [], error: invR.reason?.message };
    const jobd    = jobR.status    === 'fulfilled' ? jobR.value    : { totalJobs: null, totalThisMonth: null, avgProgress: null, error: jobR.reason?.message };
    const firmd   = firmR.status   === 'fulfilled' ? firmR.value   : { total: null, firms: [], error: firmR.reason?.message };
    const rMesd   = rMesR.status   === 'fulfilled' ? rMesR.value   : { reportings: [], totalCount: 0, error: rMesR.reason?.message };
    const photosd = photosR.status === 'fulfilled' ? photosR.value : { photos: [], reportingUuids: [], totalPhotos: null, error: photosR.reason?.message };

    add('3', ud.error      ? 'warn' : 'ok', `Usuários: ${ud.users.length}/${ud.totalCount}${ud.error ? ' — '+ud.error : ''}`, ud.latencyMs);
    add('3', rd.error      ? 'warn' : 'ok', `Apontamentos: ${rd.reportings.length}/${rd.totalCount}${rd.error ? ' — '+rd.error : ''}`, rd.latencyMs);
    add('3', invd.error    ? 'warn' : 'ok', `Inventários: ${invd.withImageCount}/${invd.totalCount} c/foto · ${invd.inventoryItems?.length ?? 0} itens${invd.error ? ' — '+invd.error : ''}`, invd.latencyMs);
    add('3', jobd.error    ? 'warn' : 'ok', `Jobs: ${jobd.totalThisMonth}/${jobd.totalJobs} este mês, progress:${jobd.avgProgress}%${jobd.error ? ' — '+jobd.error : ''}`, jobd.latencyMs);
    add('3', firmd.error   ? 'warn' : 'ok', `Equipes: ${firmd.total} cadastradas${firmd.error ? ' — '+firmd.error : ''}`, firmd.latencyMs);
    add('3', rMesd.error   ? 'warn' : 'ok', `Apontamentos do mês: ${rMesd.reportings.length}/${rMesd.totalCount}${rMesd.error ? ' — '+rMesd.error : ''}`, rMesd.latencyMs);
    add('3', photosd.error ? 'warn' : 'ok', `Fotos 15d: ${photosd.totalFetched ?? 0}/${photosd.totalPhotos ?? '?'} fotos · ${photosd.reportingUuids?.length ?? 0} apontamentos${photosd.error ? ' — '+photosd.error : ''}`, photosd.latencyMs);

    add('4', 'run', 'Calculando métricas e alertas…');
    const dash = buildConcessaoDashboard(selected, ud, rd, invd, jobd, firmd, rMesd, photosd);
    add('4', 'ok', `${dash.summary.usuariosAtivos} usuários ativos | ${dash.summary.apontamentosTotal} apontamentos | ${dash.summary.alertasTotal} alertas`);

    const payload = {
      success: true, ...SOURCE, fetchedAt: new Date().toISOString(),
      auth: { latencyMs: auth.latencyMs }, company: selected, companies,
      pagination: {
        users:      { returned: ud.users.length,      totalApi: ud.totalCount,      totalPages: ud.totalPages },
        reportings: { returned: rd.reportings.length, totalApi: rd.totalCount,      totalPages: rd.totalPages },
      },
      dashboard: dash, summaryOnly, log,
    };
    if (res.locals.dashboardCacheKey) dashboardCache.set(res.locals.dashboardCacheKey, payload);
    return res.json(payload);
  } catch (err) {
    const { message } = publicKartadoError(err);
    add(err.step || 'error', 'err', message);
    return sendKartadoError(res, err, 'dashboard', { recommendation: err.recommendation || null, log, ...SOURCE });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /multi  — todas as concessões em paralelo
// Body: { username, password, pageSize? }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/multi', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { pageSize = 100 } = req.body;
  const { log, add } = makeLogger('multi');

  try {
    add('auth', 'run', 'POST /token/login/');
    const auth = await getToken(creds.username, creds.password);
    add('auth', 'ok', `Autenticado — ${auth.user?.username || creds.username}`, auth.latencyMs);

    add('companies', 'run', 'GET /Company/ — somente concessões ativas');
    const companies = await listCompanies(auth.token);
    add('companies', 'ok', `${companies.length} concessão(ões): ${companies.map(c => c.name).join(', ')}`);

    if (!companies.length) {
      return res.status(403).json({ success: false, error: 'Nenhuma concessão ativa disponível.', log, ...SOURCE });
    }

    const ps = Math.min(parseInt(pageSize) || 100, 100);
    add('load', 'run', `Consultando ${companies.length} concessões em paralelo — active=true em todas as consultas de usuários…`);
    const t0  = Date.now();
    const raw = await loadAllCompanies(auth.token, companies, { pageSize: ps });

    raw.forEach(d => {
      const u = d.users.error      ? `⚠ ${d.users.error}`                                  : `${d.users.users?.length} ativos de ${d.users.totalCount}`;
      const r = d.reportings.error ? `⚠ ${d.reportings.error}`                             : `${d.reportings.reportings?.length} de ${d.reportings.totalCount} apontamentos`;
      add('load', d.users.error ? 'warn' : 'ok', `${d.company.name}: ${u} | ${r}`);
    });
    add('load', 'ok', `Carga concluída`, Date.now() - t0);

    add('analytics', 'run', 'Construindo dashboard consolidado…');
    const dashboard = buildMultiDashboard(raw);
    add('analytics', 'ok', `${dashboard.totals.usuariosAtivos} usuários ativos | ${dashboard.totals.apontamentos} apontamentos | ${dashboard.totals.criticos} críticos`);

    return res.json({
      success: true, ...SOURCE, fetchedAt: new Date().toISOString(),
      auth: { latencyMs: auth.latencyMs, user: auth.user?.username || creds.username },
      dashboard, log,
    });
  } catch (err) {
    const { message } = publicKartadoError(err);
    add(err.step || 'error', 'err', message);
    return sendKartadoError(res, err, 'multi', { log, ...SOURCE });
  }
});

// Páginas curtas evitam manter uma requisição HTTP aberta durante todo o histórico.
kartadoRouter.post('/reportings/page', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  const { companyUuid, page = 1, kind = 'reportings' } = req.body;
  if (!['reportings', 'inventory'].includes(kind) || typeof companyUuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(companyUuid) || !Number.isSafeInteger(page) || page < 1) {
    return res.status(400).json({ error: 'Unidade ou página inválida.' });
  }
  const started = Date.now();
  let stage = 'authentication';
  try {
    const { token } = await getToken(creds.username, creds.password);
    stage = 'kartado';
    const data = await listReportingPage(token, companyUuid, page, kind);
    stage = 'normalization';
    const metrics = buildReportingMetrics(data.items, data.totalCount);
    if (data.failedRecords.length) console.warn('[Kartado/reportings/page/partial]', { companyUuid, page, failedRecords: data.failedRecords, elapsedMs: Date.now() - started });
    res.set('Cache-Control', 'no-store').json({ items: metrics.items, total: data.totalCount, pages: data.totalPages, failedRecords: data.failedRecords });
  } catch (err) {
    const status = Number.isInteger(err.httpStatus) && err.httpStatus >= 400 && err.httpStatus <= 599 ? err.httpStatus : 502;
    // Não registra tokens, credenciais ou corpos retornados pela API externa.
    console.error('[Kartado/reportings/page]', { companyUuid, page, stage, status, elapsedMs: Date.now() - started, kind: err.name || 'UpstreamError' });
    const retry = Number(err.retryAfter);
    if (Number.isFinite(retry) && retry > 0) res.set('Retry-After', String(Math.ceil(retry)));
    const reason = stage === 'normalization' ? 'Falha ao processar os registros recebidos.' : stage === 'authentication' ? 'Falha na autenticação com o Kartado.' : 'Falha ao consultar o Kartado.';
    res.status(status).json({ error: reason, page, stage });
  }
});
