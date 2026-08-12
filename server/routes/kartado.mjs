/**
 * Kartado Router — /api/v1/kartado/*
 * Fonte única: https://api.kartado.com.br
 * Somente usuários ativos (active=true enviado em toda consulta).
 * Sem mock. Sem dados legados.
 */

import { Router } from 'express';
import {
  getToken, listCompanies, listUsers, listReportings,
  listInventoryCounts, listJobProgress, listMDRDays, listFirmCounts,
  loadAllCompanies, runDiagnostics, validateProgramacoes, getReportingPhotos,
  listPhotosForCompany, extractPage,
} from '../services/kartado.service.mjs';
import { buildConcessaoDashboard, buildMultiDashboard } from '../services/kartado-analytics.service.mjs';

export const kartadoRouter = Router();

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
// GET /status
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.get('/status', (_req, res) => res.json({
  success: true, ...SOURCE,
  endpoints: {
    'GET  /status':     'Status da integração',
    'POST /auth':       'Autentica e retorna info do usuário',
    'POST /diagnose':   'Testa permissões + detecta formato das respostas',
    'POST /inspect':    'Inspeciona resposta bruta de qualquer endpoint',
    'POST /companies':  'Lista concessões ativas',
    'POST /search':     'Busca usuários por nome/e-mail/username em uma concessão',
    'POST /dashboard':              'Dashboard de uma concessão (users ativos + apontamentos)',
    'POST /multi':                  'Dashboard consolidado de todas as concessões',
    'POST /validate-programacoes':  'Valida estratégias de acesso a dados de programação por concessão',
    'POST /reporting-photos':       'Busca fotos de um apontamento pelo UUID',
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/auth', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  try {
    const { token, user, latencyMs } = await getToken(creds.username, creds.password);
    res.json({ success: true, ...SOURCE, latencyMs, user: user || { username: creds.username }, tokenPreview: `${token.slice(0,30)}…` });
  } catch (err) {
    res.status(err.httpStatus || 500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /diagnose
// Testa permissões e detecta o formato real das respostas da API
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/diagnose', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  try {
    const { token, user, latencyMs } = await getToken(creds.username, creds.password);
    // Pega uma company real para testar
    let sampleUuid = null;
    try {
      const cos = await listCompanies(token);
      sampleUuid = cos[0]?.uuid || null;
    } catch (_) {}

    const diag = await runDiagnostics(token, sampleUuid);
    const recs = [];
    if (!diag.company?.ok)   recs.push({ endpoint: 'GET /Company/',               status: diag.company?.status,   action: 'Solicitar permissão ao suporte Kartado.' });
    if (!diag.user?.ok)      recs.push({ endpoint: 'GET /User/?company=',         status: diag.user?.status,      action: 'Verificar permissão de leitura de usuários.' });
    if (!diag.reporting?.ok) recs.push({ endpoint: 'GET /Reporting/Spreadsheet/', status: diag.reporting?.status, action: 'Solicitar permissão ao suporte Kartado para apontamentos.' });

    res.json({
      success: true, ...SOURCE,
      auth: { latencyMs, user: user?.username || creds.username },
      sampleCompanyUuid: sampleUuid,
      diagnostics: diag,
      recommendations: recs,
      allOk: recs.length === 0,
    });
  } catch (err) {
    res.status(err.httpStatus || 500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /inspect
// Mostra a resposta bruta de qualquer endpoint (ferramenta de debug)
// Body: { username, password, path, params }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/inspect', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;
  const { path: apiPath = '/Reporting/Spreadsheet/', params = {} } = req.body;
  try {
    const { token, user } = await getToken(creds.username, creds.password);
    const clean = Object.fromEntries(Object.entries(params).filter(([,v]) => v != null && v !== ''));
    const qs    = Object.keys(clean).length ? '?' + new URLSearchParams(clean) : '';
    const url   = `https://api.kartado.com.br${apiPath}${qs}`;

    console.log(`[inspect] → ${url}`);
    const t0  = Date.now();
    const raw = await fetch(url, { headers: { 'Authorization': `JWT ${token}`, 'Cache-Control': 'no-cache' } });
    const ms  = Date.now() - t0;
    const body = await raw.text();

    let parsed; try { parsed = JSON.parse(body); } catch { parsed = null; }

    // extractPage já trata os 4 formatos conhecidos do Kartado (A: Reporting
    // com data.results aninhado, B: JSON:API, C: DRF plano, D: array direto).
    // Sem isso, endpoints Formato A (ex.: /Reporting/Spreadsheet/, onde `data`
    // é um objeto com `results` dentro, não um array) quebravam com
    // "parsed?.data?.slice is not a function" ao tentar tratar `data` como array.
    const extracted = parsed ? extractPage(parsed, 1) : null;

    const info = parsed ? {
      topLevelKeys:  Object.keys(parsed),
      hasData:       'data'    in parsed,
      hasResults:    'results' in parsed,
      hasMeta:       'meta'    in parsed,
      hasCount:      'count'   in parsed,
      hasNext:       'next'    in parsed,
      itemsLen:      extracted?.items.length ?? null,
      totalCount:    extracted?.totalCount   ?? null,
      totalPages:    extracted?.totalPages   ?? null,
      firstItemKeys: extracted?.items?.[0] ? Object.keys(extracted.items[0]) : null,
      firstAttrKeys: extracted?.items?.[0]?.attributes ? Object.keys(extracted.items[0].attributes) : null,
    } : null;

    res.json({
      success: raw.ok, httpStatus: raw.status, url, latencyMs: ms,
      auth: { user: user?.username || creds.username },
      responseInfo: info,
      sample: extracted?.items?.slice(0, 2) ?? parsed,
      rawPreview: body.slice(0, 3000),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
    res.status(err.httpStatus || 500).json({ success: false, error: err.message });
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
    res.status(err.httpStatus || 500).json({ success: false, error: err.message });
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
  const { companyUuid, foundAtAfter = '', foundAtBefore = '', origin = '', pageSize = 100 } = req.body;
  if (!companyUuid) return res.status(400).json({ success: false, error: 'companyUuid é obrigatório.' });

  try {
    const { token, latencyMs: authMs } = await getToken(creds.username, creds.password);
    const data = await listReportings(token, companyUuid, {
      pageSize: Math.min(parseInt(pageSize) || 100, 100),
      foundAtAfter,
      foundAtBefore,
      origin,
    });
    res.json({
      success: true, ...SOURCE,
      auth:        { latencyMs: authMs },
      companyUuid,
      filter:      { foundAtAfter, foundAtBefore },
      pagination:  { returned: data.reportings.length, totalApi: data.totalCount, totalPages: data.totalPages, isFirstPage: data.isFirstPage },
      reportings:  data.reportings,
      note: data.isFirstPage
        ? `Exibindo 100 mais recentes. Total na base: ${data.totalCount}. Use foundAtAfter/foundAtBefore para filtrar por período.`
        : `${data.reportings.length} apontamentos retornados para o período ${foundAtAfter || '*'} → ${foundAtBefore || '*'}`,
    });
  } catch (err) {
    res.status(err.httpStatus || 500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dashboard  — uma concessão
// Body: { username, password, companyUuid?, pageSize? }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/dashboard', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { companyUuid, companyName, concessaoNome, pageSize = 100 } = req.body;
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
            throw { step: 'companies', httpStatus: 403, message: 'Nenhuma concessão ativa disponível.' };
          }
        }
      } catch (e) {
        if (e.step === 'companies') throw e;
        add('2', 'warn', `GET /Company/ falhou: ${e.message}`);
        throw { ...e, recommendation: 'Forneça companyUuid no body.' };
      }
    }

    const ps = Math.min(parseInt(pageSize) || 100, 100);
    const now2 = new Date();
    const startOfMonth    = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().split('T')[0];
    const quinzeDiasAtras = new Date(now2.getTime() - 15 * 86_400_000).toISOString().split('T')[0];

    add('3', 'run', `GET /User/ + /Reporting/ + /Inventory/ + /Job/ + /Firm/ + /Reporting(mês) + /Photo/(15d) — company=${selected.uuid}`);
    const [uR, rR, invR, jobR, firmR, rMesR, photosR] = await Promise.allSettled([
      listUsers(auth.token, selected.uuid, { pageSize: ps }),
      listReportings(auth.token, selected.uuid, { pageSize: ps }),
      listInventoryCounts(auth.token, selected.uuid),
      listJobProgress(auth.token, selected.uuid),
      listFirmCounts(auth.token, selected.uuid),
      listReportings(auth.token, selected.uuid, { foundAtAfter: startOfMonth, pageSize: ps, maxPages: 3 }),
      listPhotosForCompany(auth.token, selected.uuid, { foundAtAfter: quinzeDiasAtras, pageSize: 100, maxPages: 5 }),
    ]);

    const ud = uR.status === 'fulfilled'
      ? uR.value
      : { users: [], totalCount: 0, latencyMs: 0, error: uR.reason?.message };

    let rd;
    if (rR.status === 'fulfilled') {
      rd = rR.value;
    } else {
      try {
        const fallback = await listReportings(auth.token, selected.uuid, { pageSize: 1 });
        rd = { ...fallback, reportings: [], error: `Apontamentos parcialmente indisponíveis: ${rR.reason?.message}` };
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

    return res.json({
      success: true, ...SOURCE, fetchedAt: new Date().toISOString(),
      auth: { latencyMs: auth.latencyMs }, company: selected, companies,
      pagination: {
        users:      { returned: ud.users.length,      totalApi: ud.totalCount,      totalPages: ud.totalPages },
        reportings: { returned: rd.reportings.length, totalApi: rd.totalCount,      totalPages: rd.totalPages },
      },
      dashboard: dash, log,
    });
  } catch (err) {
    add(err.step || 'error', 'err', err.message);
    return res.status((err.httpStatus || 500) < 500 ? 400 : 500).json({ success: false, error: err.message, recommendation: err.recommendation || null, log, ...SOURCE });
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
    add(err.step || 'error', 'err', err.message);
    return res.status((err.httpStatus || 500) < 500 ? 400 : 500).json({ success: false, error: err.message, log, ...SOURCE });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /health  — índice de saúde por unidade (concessão)
// Body: { username, password, pageSize? }
// ─────────────────────────────────────────────────────────────────────────────
function calcHealthScore(concessao) {
  const u = concessao.users?.counts  || {};
  const s = concessao.summary        || {};
  const total = u.returned || 1;

  // Penalizações baseadas em proporção de usuários problemáticos
  const pctExpirados = (u.expirados     || 0) / total;
  const pctSemEmail  = (u.semEmail      || 0) / total;
  const pctSemTos    = (u.semTos        || 0) / total;

  // Cada dimensão é uma nota de 0-100
  const dimExpirados = Math.max(0, 100 - Math.round(pctExpirados * 200));  // 50%+ = zero
  const dimEmail     = Math.max(0, 100 - Math.round(pctSemEmail  * 150));  // 67%+ = zero
  const dimTos       = Math.max(0, 100 - Math.round(pctSemTos    * 100));  // 100% = zero

  // Penalidade por alertas críticos
  const criticos = s.alertasCriticos || 0;
  const dimAlerts = Math.max(0, 100 - criticos * 15);

  // Média ponderada: expiração tem mais peso
  const score = Math.round(
    dimExpirados * 0.35 +
    dimEmail     * 0.20 +
    dimTos       * 0.15 +
    dimAlerts    * 0.30
  );

  const status = score >= 80 ? 'ok' : score >= 60 ? 'warning' : 'danger';

  return {
    score,
    status,
    dimensions: {
      expirados: { score: dimExpirados, count: u.expirados || 0, pct: Math.round(pctExpirados * 100) },
      semEmail:  { score: dimEmail,     count: u.semEmail  || 0, pct: Math.round(pctSemEmail  * 100) },
      semTos:    { score: dimTos,       count: u.semTos    || 0, pct: Math.round(pctSemTos    * 100) },
      alertas:   { score: dimAlerts,    criticos, atencao: s.alertasAtencao || 0 },
    },
    topRisks: (concessao.users?.alertas || [])
      .filter(a => a.severity === 'danger' || a.severity === 'warning')
      .slice(0, 3)
      .map(a => ({ severity: a.severity, title: a.title, count: a.count })),
  };
}

kartadoRouter.post('/health', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { pageSize = 100 } = req.body;
  const { log, add } = makeLogger('health');

  try {
    add('auth', 'run', 'POST /token/login/');
    const auth = await getToken(creds.username, creds.password);
    add('auth', 'ok', `Autenticado — ${auth.user?.username || creds.username}`, auth.latencyMs);

    add('companies', 'run', 'GET /Company/ — listando concessões');
    const companies = await listCompanies(auth.token);
    add('companies', 'ok', `${companies.length} concessão(ões)`);

    if (!companies.length) {
      return res.status(403).json({ success: false, error: 'Nenhuma concessão ativa disponível.', log, ...SOURCE });
    }

    const ps = Math.min(parseInt(pageSize) || 100, 100);
    add('load', 'run', `Carregando dados de ${companies.length} unidade(s)…`);
    const raw = await loadAllCompanies(auth.token, companies, { pageSize: ps });
    add('load', 'ok', `Dados carregados`);

    const { concessoes } = buildMultiDashboard(raw);

    const units = concessoes.map(c => ({
      company: { uuid: c.company?.uuid, name: c.company?.name },
      usuarios: {
        total:         c.summary.usuariosAtivos,
        retornados:    c.summary.usuariosRetornados,
        expirados:     c.users?.counts?.expirados     || 0,
        semEmail:      c.users?.counts?.semEmail      || 0,
        semTos:        c.users?.counts?.semTos        || 0,
        expirandoEm30: c.users?.counts?.expirandoEm30 || 0,
      },
      apontamentos: {
        total:   c.summary.apontamentosTotal,
        alertas: (c.reportings?.alerts || []).length,
      },
      alertas: {
        total:    c.summary.alertasTotal,
        criticos: c.summary.alertasCriticos,
        atencao:  c.summary.alertasAtencao,
      },
      health: calcHealthScore(c),
    }));

    const overall = Math.round(units.reduce((s, u) => s + u.health.score, 0) / (units.length || 1));
    const overallStatus = overall >= 80 ? 'ok' : overall >= 60 ? 'warning' : 'danger';

    return res.json({
      success: true, ...SOURCE, fetchedAt: new Date().toISOString(),
      overall: { score: overall, status: overallStatus, units: units.length },
      units,
      log,
    });
  } catch (err) {
    add(err.step || 'error', 'err', err.message);
    return res.status((err.httpStatus || 500) < 500 ? 400 : 500).json({ success: false, error: err.message, log, ...SOURCE });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /validate-programacoes
// Testa 4 estratégias de acesso a dados de programação para uma concessão.
// Body: { username, password, companyUuid }
// ─────────────────────────────────────────────────────────────────────────────
// ── GET /sync-stream — sincronização em tempo real via Server-Sent Events ──────
// Query: username, password, companyUuid, companyName
// Emite eventos SSE à medida que cada fonte de dados é buscada em paralelo.
kartadoRouter.get('/sync-stream', async (req, res) => {
  const username = process.env.KARTADO_USERNAME;
  const password = process.env.KARTADO_PASSWORD;
  const { companyUuid, companyName } = req.query;

  if (!username || !password || !companyUuid) {
    return res.status(503).json({ error: 'Integração Kartado não configurada ou concessão ausente.' });
  }

  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',       'no-cache');
  res.setHeader('Connection',          'keep-alive');
  res.setHeader('X-Accel-Buffering',   'no');
  res.flushHeaders();

  const emit = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const now            = new Date();
  const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const quinzeDias     = new Date(now.getTime() - 15 * 86_400_000).toISOString().split('T')[0];

  try {
    emit('step', { key: 'auth', status: 'loading', label: 'Autenticando no Kartado…', ts: Date.now() });
    const auth = await getToken(username, password);
    emit('step', { key: 'auth', status: 'ok', label: `Autenticado — ${auth.user?.username || username}`, latencyMs: auth.latencyMs, ts: Date.now() });

    const selected = { uuid: companyUuid, name: companyName || companyUuid };

    const TASKS = [
      { key: 'usuarios',         label: 'Usuários',              fn: () => listUsers(auth.token, selected.uuid, { pageSize: 100 }) },
      { key: 'apontamentos',     label: 'Apontamentos',          fn: () => listReportings(auth.token, selected.uuid, { pageSize: 100 }) },
      { key: 'inventarios',      label: 'Inventários',           fn: () => listInventoryCounts(auth.token, selected.uuid) },
      { key: 'programacoes',     label: 'Programações',          fn: () => listJobProgress(auth.token, selected.uuid) },
      { key: 'equipes',          label: 'Equipes',               fn: () => listFirmCounts(auth.token, selected.uuid) },
      { key: 'apontamentos-mes', label: 'Apontamentos do mês',   fn: () => listReportings(auth.token, selected.uuid, { foundAtAfter: startOfMonth,  pageSize: 100, maxPages: 3 }) },
      { key: 'apontamentos-15d', label: 'Fotos — 15 dias',       fn: () => listPhotosForCompany(auth.token, selected.uuid, { foundAtAfter: quinzeDias, pageSize: 100, maxPages: 5 }) },
    ];

    // Emite todos como "aguardando" antes de iniciar
    TASKS.forEach(t => emit('step', { key: t.key, status: 'waiting', label: t.label, ts: Date.now() }));

    const results = {};
    await Promise.all(TASKS.map(async ({ key, label, fn }) => {
      emit('step', { key, status: 'loading', label, ts: Date.now() });
      const t0 = Date.now();
      try {
        results[key] = await fn();
        const count =
          results[key]?.totalCount            ??
          results[key]?.totalPhotos           ??
          results[key]?.reportings?.length    ??
          results[key]?.users?.length         ??
          results[key]?.total                 ?? null;
        emit('step', { key, status: 'ok', label, count, latencyMs: Date.now() - t0, ts: Date.now() });
      } catch (e) {
        results[key] = { error: e.message };
        emit('step', { key, status: 'error', label, error: e.message, latencyMs: Date.now() - t0, ts: Date.now() });
      }
    }));

    emit('done', {
      ts: Date.now(),
      company: selected,
      summary: {
        usuarios:        results.usuarios?.totalCount                          ?? 0,
        apontamentos:    results.apontamentos?.totalCount                      ?? 0,
        apontamentosMes: results['apontamentos-mes']?.totalCount               ?? 0,
        apontamentos15d: results['apontamentos-15d']?.totalPhotos               ?? results['apontamentos-15d']?.totalCount ?? 0,
        inventarios:     results.inventarios?.totalCount                       ?? null,
        programacoes:    results.programacoes?.totalJobs                       ?? null,
        equipes:         results.equipes?.total                                ?? null,
      },
    });

  } catch (e) {
    emit('error', { message: e.message, ts: Date.now() });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /reporting-photos
// Body: { username, password, reportingUuid }
// ─────────────────────────────────────────────────────────────────────────────
kartadoRouter.post('/reporting-photos', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { reportingUuid } = req.body;
  if (!reportingUuid) return res.status(400).json({ success: false, error: 'reportingUuid é obrigatório.' });

  try {
    const { token, user, latencyMs: authMs } = await getToken(creds.username, creds.password);
    const result = await getReportingPhotos(token, reportingUuid);

    return res.json({
      success: true, ...SOURCE,
      fetchedAt: new Date().toISOString(),
      auth: { latencyMs: authMs, user: user?.username || creds.username },
      reportingUuid,
      ...result,
    });
  } catch (err) {
    return res.status((err.httpStatus || 500) < 500 ? 400 : 500).json({ success: false, error: err.message });
  }
});

kartadoRouter.post('/validate-programacoes', async (req, res) => {
  const creds = requireCreds(req, res);
  if (!creds) return;

  const { companyUuid } = req.body;
  if (!companyUuid) return res.status(400).json({ success: false, error: 'companyUuid é obrigatório.' });

  try {
    const { token, user, latencyMs: authMs } = await getToken(creds.username, creds.password);
    const report = await validateProgramacoes(token, companyUuid);

    return res.json({
      success: true, ...SOURCE,
      fetchedAt: new Date().toISOString(),
      auth: { latencyMs: authMs, user: user?.username || creds.username },
      companyUuid,
      ...report,
      interpretation: report.recomendada
        ? `✓ Estratégia viável: "${report.recomendada.label}" → ${report.recomendada.totalCount} inventários (${report.recomendada.pctDoCadastro ?? '?'}% do cadastro). Utilize para calcular dimProgramacoes.`
        : '✗ Nenhuma estratégia retornou dados utilizáveis. /Job/ pode não estar acessível ou os filtros não são suportados.',
    });
  } catch (err) {
    return res.status((err.httpStatus || 500) < 500 ? 400 : 500).json({ success: false, error: err.message, ...SOURCE });
  }
});

