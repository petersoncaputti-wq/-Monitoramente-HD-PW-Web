/**
 * Kartado Service — Concorrência controlada
 *
 * REGRA ÚNICA: no máximo 5 requisições simultâneas para a API Kartado
 * em qualquer momento, independente de quantas concessões ou páginas existam.
 *
 * Implementado via semáforo (pool de slots).
 */

const BASE        = (process.env.KARTADO_API_URL || 'https://api.kartado.com.br').replace(/\/$/, '');
const ACCEPT      = 'application/vnd.api+json';
const TIMEOUT_MS  = 25_000;   // 25s por chamada
const CONCURRENCY = 5;        // máx simultâneas — nunca ultrapassar

// ── Semáforo — pool de N slots ────────────────────────────────────────────────
function createSemaphore(limit) {
  let active  = 0;
  const queue = [];

  const acquire = () => new Promise(resolve => {
    const tryAcquire = () => {
      if (active < limit) { active++; resolve(); }
      else queue.push(tryAcquire);
    };
    tryAcquire();
  });

  const release = () => {
    active--;
    if (queue.length > 0) queue.shift()();
  };

  return { acquire, release, status: () => ({ active, queued: queue.length }) };
}

// Semáforo global — compartilhado por todas as chamadas do processo
const sem = createSemaphore(CONCURRENCY);

// ── Fetch com timeout + semáforo ──────────────────────────────────────────────
async function safeFetch(url, options = {}) {
  await sem.acquire();
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res  = await fetch(url, { ...options, signal: ctrl.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    if (e.name === 'AbortError') throw { httpStatus: 504, message: `Timeout (${TIMEOUT_MS}ms): ${url}` };
    throw e;
  } finally {
    clearTimeout(tid);
    sem.release();
  }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function apiFetch(token, path, params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  const qs    = Object.keys(clean).length ? '?' + new URLSearchParams(clean) : '';
  const url   = `${BASE}${path}${qs}`;

  const { ok, status, body } = await safeFetch(url, {
    headers: { 'Accept': ACCEPT, 'Authorization': `JWT ${token}` },
  });

  if (!ok) {
    let p; try { p = JSON.parse(body); } catch { p = null; }
    // Evita incluir HTML completo na mensagem de erro (respostas 404/500 em HTML)
    const rawDetail = p?.errors?.[0]?.detail || p?.detail || (body.startsWith('<') ? null : body.slice(0, 200));
    const detail = rawDetail || `HTTP ${status}`;
    const err = { httpStatus: status, message: `[${status}] ${path}: ${detail}` };
    if (status === 403 || status === 401) {
      // Token rejeitado — invalida cache para forçar nova autenticação
      for (const [u, v] of _tokenCache.entries()) {
        if (v.token === options?.headers?.Authorization?.replace('JWT ', '')) {
          _tokenCache.delete(u);
          break;
        }
      }
      err.permanent = true;
    }
    throw err;
  }

  try { return JSON.parse(body); }
  catch { throw { httpStatus: 200, message: `Resposta não-JSON em ${path}: ${body.slice(0, 100)}` }; }
}

// ── Extrai items + paginação — todos os formatos Kartado ─────────────────────
export function extractPage(payload, pageSize) {
  // Formato A — Reporting: { data: { results:[], meta:{pagination} } }
  if (payload?.data && Array.isArray(payload.data?.results)) {
    const pag   = payload.data?.meta?.pagination || payload.meta?.pagination || {};
    const total = pag.count ?? payload.data.results.length;
    return { items: payload.data.results, totalCount: total, totalPages: pag.pages ?? (Math.ceil(total / pageSize) || 1) };
  }
  // Formato B — JSON:API: { data:[], meta:{pagination} }
  if (Array.isArray(payload?.data)) {
    const pag   = payload?.meta?.pagination || {};
    const total = pag.count ?? (payload.count ?? payload.data.length);
    return { items: payload.data, totalCount: total, totalPages: pag.pages ?? (Math.ceil(total / pageSize) || 1) };
  }
  // Formato C — DRF plano: { results:[], count }
  if (Array.isArray(payload?.results)) {
    const total = payload.count ?? payload.results.length;
    return { items: payload.results, totalCount: total, totalPages: Math.ceil(total / pageSize) || 1 };
  }
  // Formato D — array direto
  if (Array.isArray(payload)) {
    return { items: payload, totalCount: payload.length, totalPages: 1 };
  }
  console.warn('[Kartado] extractPage: formato desconhecido. Keys:', Object.keys(payload || {}));
  return { items: [], totalCount: 0, totalPages: 1 };
}

// ── Busca todas as páginas via fila serializada (respeita semáforo) ───────────
// Página 1 primeiro → descobre total → enfileira restantes
// O semáforo garante que nunca mais de CONCURRENCY páginas rodam ao mesmo tempo,
// independente de quantas concessões estão sendo buscadas em paralelo.
async function fetchPages(token, path, params, maxPages = 0) {
  const ps = Math.min(parseInt(params.page_size) || 100, 100);
  const t0 = Date.now();

  // Página 1 — obrigatória
  const first = await apiFetch(token, path, { ...params, page: 1, page_size: ps });
  const { items: items1, totalCount, totalPages } = extractPage(first, ps);

  const limit = maxPages > 0 ? Math.min(totalPages, maxPages) : totalPages;

  if (limit <= 1) {
    return { items: items1, totalCount, totalPages, latencyMs: Date.now() - t0 };
  }

  // Páginas 2..limit — lançadas como promises, o semáforo serializa execução
  const pageNums = Array.from({ length: limit - 1 }, (_, i) => i + 2);
  const settled  = await Promise.allSettled(
    pageNums.map(p => apiFetch(token, path, { ...params, page: p, page_size: ps }))
  );

  const allItems = [...items1];
  let failed = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      allItems.push(...extractPage(r.value, ps).items);
    } else {
      failed++;
      console.warn(`[Kartado] pág. falhou em ${path} pg${failed}: ${r.reason?.message}`);
    }
  }
  if (failed) console.warn(`[Kartado] ${failed}/${limit} páginas falharam em ${path}`);

  return { items: allItems, totalCount, totalPages, failedPages: failed, latencyMs: Date.now() - t0 };
}

// ── Token cache — reusa o JWT por 6 dias (TTL do token Kartado é 7 dias) ─────
// Elimina N-1 autenticações desnecessárias quando N concessões carregam em paralelo.
const _tokenCache = new Map(); // username → { token, user, expiresAt }
const TOKEN_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 dias (1 dia de margem)

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function getToken(username, password) {
  const cached = _tokenCache.get(username);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    console.log(`[Auth] cache hit — ${username} (expira em ${Math.round((cached.expiresAt - Date.now()) / 3_600_000)}h)`);
    return { token: cached.token, user: cached.user, latencyMs: 0, fromCache: true };
  }
  const t0 = Date.now();
  const { ok, status, body } = await safeFetch(`${BASE}/token/login/`, {
    method:  'POST',
    headers: { 'Content-Type': ACCEPT, 'Accept': ACCEPT },
    body: JSON.stringify({
      data: { type: 'ObtainJSONWebToken', attributes: { username, password } },
    }),
  });

  const ms      = Date.now() - t0;
  const payload = JSON.parse(body || '{}');

  if (!ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.detail || body;
    throw { step: 'auth', httpStatus: status, message: `Auth falhou [${status}]: ${detail}` };
  }

  const token = payload?.data?.token || payload?.data?.attributes?.token || payload?.token || null;
  if (!token) throw { step: 'auth', httpStatus: 200, message: `Token não encontrado. Payload: ${body.slice(0,200)}` };

  const user = payload?.data?.user || null;
  _tokenCache.set(username, { token, user, expiresAt: Date.now() + TOKEN_TTL_MS });
  console.log(`[Auth] novo token obtido — ${username} (${ms}ms)`);
  return { token, user, latencyMs: ms };
}

// Limpa o cache de um usuário (ex: após erro 401 ou logout)
export function invalidateToken(username) {
  _tokenCache.delete(username);
}

// ── Companies ─────────────────────────────────────────────────────────────────
export async function listCompanies(token) {
  const payload = await apiFetch(token, '/Company/', { page: 1, page_size: 100 });
  const { items } = extractPage(payload, 100);
  return items
    .map(c => ({
      id:        c.id,
      uuid:      c.attributes?.uuid || c.id,
      name:      c.attributes?.name || c.name || c.id,
      legalName: c.attributes?.legalName || c.legalName || null,
      cnpj:      c.attributes?.cnpj || c.cnpj || null,
      active:    c.attributes?.active ?? c.active ?? true,
    }))
    .filter(c => c.active !== false);
}

// ── Users — somente ativos, todas as páginas via semáforo ────────────────────
export async function listUsers(token, companyUuid, { pageSize = 100, search = '', maxPages = 10 } = {}) {
  if (!companyUuid) throw { step: 'users', httpStatus: 400, message: 'company UUID obrigatório.' };

  const params = { company: companyUuid, active: 'true', page_size: pageSize };
  if (search) params.search = search;

  // maxPages: mesma proteção do /dashboard para reportings — concessões com
  // muitos usuários (>1000) não devem gerar dezenas de páginas sem limite.
  const result = await fetchPages(token, '/User/', params, maxPages);
  console.log(`[Users] ${companyUuid.slice(0,8)}… → ${result.items.length}/${result.totalCount} (${result.totalPages}pgs) ${result.latencyMs}ms | concorrência: ${sem.status().active}/${CONCURRENCY}`);
  return { users: result.items, totalCount: result.totalCount, totalPages: result.totalPages, latencyMs: result.latencyMs };
}

// ── Reportings — página 1 no dashboard; filtro de data busca mais páginas ────
export async function listReportings(token, companyUuid, { pageSize = 100, foundAtAfter = '', foundAtBefore = '', origin = '', maxPages = 0 } = {}) {
  if (!companyUuid) throw { step: 'reportings', httpStatus: 400, message: 'company UUID obrigatório.' };

  const params = { company: companyUuid, page_size: pageSize };
  if (foundAtAfter)  params.found_at_after  = foundAtAfter;
  if (foundAtBefore) params.found_at_before = foundAtBefore;
  if (origin)        params.origin          = origin;

  const hasDateFilter = !!(foundAtAfter || foundAtBefore);
  const hasFilter     = !!(hasDateFilter || origin);

  // Só busca todas as páginas quando há filtro de DATA — origem sozinha fica em pg1
  // para evitar timeout por volume excessivo de requisições
  // maxPages > 0 limita o número de páginas mesmo com filtro de data
  const result = hasDateFilter
    ? await fetchPages(token, '/Reporting/Spreadsheet/', params, maxPages)
    : await fetchPages(token, '/Reporting/Spreadsheet/', params, 1);

  const label = [foundAtAfter && 'data', origin && `origem:${origin}`].filter(Boolean).join('+') || 'pg1';
  console.log(`[Reporting] ${companyUuid.slice(0,8)}… → ${result.items.length}/${result.totalCount} (${label}) ${result.latencyMs}ms`);
  return {
    reportings:  result.items,
    totalCount:  result.totalCount,
    page1Count:  result.totalCount,
    totalPages:  result.totalPages,
    latencyMs:   result.latencyMs,
    isFirstPage: !hasFilter && result.totalPages > 1,
  };
}

// ── Classes (OccurrenceType) — resolve nome → UUID, contagem exata por Classe ─
// Descoberto via investigação real: porTipoJson (byType) é uma AMOSTRA (100
// apontamentos mais recentes, sem filtro de data) — nunca bate com o painel
// nativo do Kartado, que filtra o histórico completo por Classe exata. O
// Kartado não aceita nome livre em occurrence_type (retorna 500) — exige o
// UUID da Classe, obtido em /OccurrenceType/. Confirmado com dados reais:
// Ecovias Capixaba, Classe "Roçada", 14-29/07/2026 → 9 (bate com o painel nativo).
export async function findOccurrenceType(token, companyUuid, name) {
  if (!companyUuid) throw { step: 'occurrenceType', httpStatus: 400, message: 'company UUID obrigatório.' };
  if (!name) return null;

  const payload = await apiFetch(token, '/OccurrenceType/', { company: companyUuid, search: name });
  const { items } = extractPage(payload, 100);
  const term = name.toLowerCase().trim();

  // Nome exato tem prioridade — "Roçada" não pode resolver para "Roçada Cerca
  // a Cerca" só porque a busca por texto do Kartado retorna as duas variantes.
  const exact = items.find(i => (i.attributes?.name || '').toLowerCase().trim() === term);
  if (exact) return { uuid: exact.attributes.uuid, name: exact.attributes.name };

  if (items.length === 1) return { uuid: items[0].attributes.uuid, name: items[0].attributes.name };

  // Ambíguo (0 ou 2+ sem match exato) — chamador decide (ex.: listar opções).
  return { ambiguous: true, options: items.map(i => ({ uuid: i.attributes.uuid, name: i.attributes.name })) };
}

// Contagem exata de uma Classe específica em um endpoint — mesmo mecanismo
// usado pelo painel nativo do Kartado (occurrence_type=UUID, opcionalmente
// com janela de data). page_size:1 — só precisamos de totalCount, não dos itens.
async function countByOccurrenceType(token, companyUuid, occurrenceTypeUuid, path, { foundAtAfter = '', foundAtBefore = '' } = {}) {
  if (!companyUuid || !occurrenceTypeUuid) {
    throw { step: 'countByType', httpStatus: 400, message: 'company e occurrenceTypeUuid são obrigatórios.' };
  }
  const params = { company: companyUuid, occurrence_type: occurrenceTypeUuid, page_size: 1 };
  if (foundAtAfter)  params.found_at_after  = foundAtAfter;
  if (foundAtBefore) params.found_at_before = foundAtBefore;

  const payload = await apiFetch(token, path, params);
  const { totalCount } = extractPage(payload, 1);
  return totalCount;
}

// Apontamentos (Reporting). Confirmado com dados reais: Ecovias Capixaba,
// Classe "Roçada", 14-29/07/2026 → 9 (bate com o painel nativo).
export async function countReportingsByOccurrenceType(token, companyUuid, occurrenceTypeUuid, opts) {
  return countByOccurrenceType(token, companyUuid, occurrenceTypeUuid, '/Reporting/Spreadsheet/', opts);
}

// Itens de Inventário — algumas Classes (ex.: "Ocupações") só existem como
// Inventário, não como apontamento. Sem isso, countReportingsByOccurrenceType
// sozinho devolve 0 para essas Classes mesmo quando o painel nativo mostra um
// total > 0. Confirmado: Ecovias Noroeste Paulista, Classe "Ocupações",
// 30/06-01/08/2026 → Reporting=0, Inventory=787 (bate com o painel nativo).
export async function countInventoryByOccurrenceType(token, companyUuid, occurrenceTypeUuid, opts) {
  return countByOccurrenceType(token, companyUuid, occurrenceTypeUuid, '/Inventory/', opts);
}

// ── Inventários — contagem total, contagem c/ foto e itens c/ foto ───────────
export async function listInventoryCounts(token, companyUuid) {
  if (!companyUuid) throw { step: 'inventory', httpStatus: 400, message: 'company UUID obrigatório.' };

  const t0       = Date.now();
  const baseParams  = { company: companyUuid, page: 1, page_size: 1 };
  const itemParams  = { company: companyUuid, has_image: 'true', page_size: 100 };
  // Amostra SEM has_image — a lista de "itens com foto" acima é enviesada (só
  // fotografados), não serve para medir os tipos mais frequentes de fato.
  const sampleParams = { company: companyUuid, page_size: 100 };
  const catalogParams = { company: companyUuid, page_size: 500 };

  // 5 requests em paralelo: totalCount, withImageCount, itens com foto (lista
  // real), amostra não enviesada p/ "por tipo", catálogo de Classes p/
  // resolver UUID → nome (Inventory só devolve o UUID cru do relacionamento,
  // diferente de /Reporting/Spreadsheet/, que já entrega o nome pronto).
  const [totalRes, imgRes, itemsRes, sampleRes, catalogRes] = await Promise.allSettled([
    apiFetch(token, '/Inventory/', baseParams),
    apiFetch(token, '/Inventory/', { ...baseParams, has_image: 'true' }),
    fetchPages(token, '/Inventory/', itemParams, 3),  // até 300 inventários com foto
    apiFetch(token, '/Inventory/', sampleParams),
    apiFetch(token, '/OccurrenceType/', catalogParams),
  ]);

  const totalCount     = totalRes.status === 'fulfilled'
    ? (extractPage(totalRes.value, 1).totalCount ?? null) : null;
  const withImageCount = imgRes.status === 'fulfilled'
    ? (extractPage(imgRes.value, 1).totalCount ?? null) : null;

  // Resolve UUID de occurrenceType → nome usando o catálogo (uma chamada só,
  // reaproveitada para todos os itens da amostra — evita 1 request por UUID distinto).
  const typeNameByUuid = new Map();
  if (catalogRes.status === 'fulfilled') {
    for (const item of extractPage(catalogRes.value, 500).items) {
      const a = item.attributes || item;
      if (a.uuid && a.name) typeNameByUuid.set(a.uuid, a.name);
    }
  }
  const typeSample = sampleRes.status === 'fulfilled'
    ? extractPage(sampleRes.value, 100).items.map(item => {
        const typeUuid = item.relationships?.occurrenceType?.data?.id || null;
        return { occurrenceType: (typeUuid && typeNameByUuid.get(typeUuid)) || 'Não identificado' };
      })
    : [];

  // As 5 chamadas podem falhar independentemente (403/500/timeout) — captura o
  // motivo de cada uma para diagnóstico. Antes só o erro de totalRes era
  // capturado; falhas isoladas em imgRes/itemsRes ficavam sem nenhum rastro.
  const errors = [
    totalRes.status   === 'rejected' ? `total: ${totalRes.reason?.message || totalRes.reason}`     : null,
    imgRes.status     === 'rejected' ? `comFoto: ${imgRes.reason?.message || imgRes.reason}`       : null,
    itemsRes.status   === 'rejected' ? `itens: ${itemsRes.reason?.message || itemsRes.reason}`     : null,
    sampleRes.status  === 'rejected' ? `amostraTipo: ${sampleRes.reason?.message || sampleRes.reason}` : null,
    catalogRes.status === 'rejected' ? `catalogo: ${catalogRes.reason?.message || catalogRes.reason}`  : null,
  ].filter(Boolean);
  const error = errors.length ? errors.join(' | ') : null;

  const rawItems = itemsRes.status === 'fulfilled' ? itemsRes.value.items : [];
  const inventoryItems = rawItems.map(item => {
    const a = item.attributes || item;
    return {
      id:          item.id || a.uuid,
      uuid:        a.uuid  || item.id,
      name:        a.name  || a.nome  || a.title || a.identificacao || null,
      description: a.description || a.descricao || a.obs  || null,
      location:    a.location    || a.localizacao || null,
      roadName:    a.roadName    || a.road_name   || a.rodovia || null,
      km:          a.km          ?? null,
      category:    a.category    || a.categoria   || a.type || null,
      foundAt:     a.foundAt     || a.found_at    || a.createdAt || a.created_at || null,
    };
  });

  // Sempre loga, mesmo quando há erro — antes o console.log só cobria o caminho
  // feliz, então uma falha parcial (ex.: só itemsRes rejeitado) não deixava
  // nenhum rastro no log do processo, só o total/comFoto (possivelmente nulos)
  // silenciosamente devolvidos ao chamador.
  const errSuffix = error ? ` — ERRO: ${error}` : '';
  console.log(`[Inventory] ${companyUuid.slice(0,8)}… → ${withImageCount}/${totalCount} c/foto · ${inventoryItems.length} itens carregados · amostra p/tipo: ${typeSample.length} (${Date.now() - t0}ms)${errSuffix}`);
  return { totalCount, withImageCount, inventoryItems, typeSample, latencyMs: Date.now() - t0, error };
}

// ── Programações — categorização e score de cumprimento por job ───────────────
export async function listJobProgress(token, companyUuid) {
  if (!companyUuid) throw { step: 'job', httpStatus: 400, message: 'company UUID obrigatório.' };
  const t0 = Date.now();
  try {
    const payload = await apiFetch(token, '/Job/', {
      company: companyUuid, archived: 'false', page: 1, page_size: 100,
    });
    const { items, totalCount } = extractPage(payload, 100);

    const now          = new Date();
    const endOfToday   = new Date(now); endOfToday.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Jobs ativos no mês corrente (startDate <= fimMês AND endDate >= inícioMês)
    const activeMes = items.filter(j => {
      const a = j.attributes || j;
      const s = a.startDate || a.start_date;
      const e = a.endDate   || a.end_date;
      if (!s) return false;
      const start = new Date(s);
      const end   = e ? new Date(e) : new Date('9999-12-31');
      return start <= endOfMonth && end >= startOfMonth;
    });

    // Categorização por situação
    const categoria = j => {
      const a = j.attributes || j;
      const prog    = a.progress ?? 0;
      const endDate = a.endDate || a.end_date;
      if (prog >= 100) return 'concluida';
      if (endDate && new Date(endDate) < endOfToday) return 'atrasada';
      return 'emAndamento';
    };

    const concluidas   = activeMes.filter(j => categoria(j) === 'concluida').length;
    const emAndamento  = activeMes.filter(j => categoria(j) === 'emAndamento').length;
    const atrasadas    = activeMes.filter(j => categoria(j) === 'atrasada').length;

    // Totais agregados
    const avgProgress             = activeMes.length > 0
      ? Math.round(activeMes.reduce((sum, j) => sum + ((j.attributes || j).progress ?? 0), 0) / activeMes.length)
      : null;
    const totalReportingCount     = activeMes.reduce((s, j) => s + ((j.attributes || j).reportingCount     ?? 0), 0);
    const totalExecutedReportings = activeMes.reduce((s, j) => s + ((j.attributes || j).executedReportings ?? 0), 0);

    // Taxa de execução ponderada pelo volume do job (mais precisa que avgProgress)
    const execRate = totalReportingCount > 0
      ? Math.round((totalExecutedReportings / totalReportingCount) * 100)
      : (avgProgress ?? 0);

    // Penalidade por jobs atrasados: 15pts cada, máx 30pts
    const penalidade     = Math.min(30, atrasadas * 15);
    const dimProgramacoes = activeMes.length > 0 ? Math.max(0, execRate - penalidade) : null;

    // Top 3 jobs atrasados com maior atraso (menos progress primeiro)
    const jobsAtrasados = activeMes
      .filter(j => categoria(j) === 'atrasada')
      .sort((a, b) => ((a.attributes || a).progress ?? 0) - ((b.attributes || b).progress ?? 0))
      .slice(0, 3)
      .map(j => {
        const a = j.attributes || j;
        return {
          title:              a.title            || a.number || 'Sem título',
          progress:           a.progress         ?? 0,
          endDate:            a.endDate          || a.end_date || null,
          executedReportings: a.executedReportings ?? 0,
          reportingCount:     a.reportingCount    ?? 0,
        };
      });

    console.log(`[Job] ${companyUuid.slice(0,8)}… → ${activeMes.length}/${totalCount} este mês | ✓${concluidas} ▶${emAndamento} ✖${atrasadas} | exec:${execRate}% dim:${dimProgramacoes} (${Date.now() - t0}ms)`);
    return {
      totalJobs: totalCount, totalThisMonth: activeMes.length,
      avgProgress, execRate, dimProgramacoes,
      concluidas, emAndamento, atrasadas,
      totalReportingCount, totalExecutedReportings,
      jobsAtrasados,
      latencyMs: Date.now() - t0, error: null,
    };
  } catch (e) {
    console.warn(`[Job] ${companyUuid.slice(0,8)}… erro: ${e.message}`);
    return {
      totalJobs: null, totalThisMonth: null, avgProgress: null, execRate: null, dimProgramacoes: null,
      concluidas: null, emAndamento: null, atrasadas: null,
      totalReportingCount: null, totalExecutedReportings: null, jobsAtrasados: [],
      latencyMs: Date.now() - t0, error: e.message,
    };
  }
}

// ── MultipleDailyReport — dias distintos com RDO de campo no mês corrente ────
export async function listMDRDays(token, companyUuid) {
  if (!companyUuid) throw { step: 'mdr', httpStatus: 400, message: 'company UUID obrigatório.' };
  const t0 = Date.now();
  try {
    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const mesAtual     = startOfMonth.slice(0, 7); // 'YYYY-MM'

    const payload = await apiFetch(token, '/MultipleDailyReport/Spreadsheet/', {
      company: companyUuid, found_at_after: startOfMonth, page: 1, page_size: 100,
    });
    const { items } = extractPage(payload, 100);

    // Conta dias distintos pelo campo date ou foundAt do MDR
    const diasSet = new Set(
      items
        .map(i => {
          const a = i.attributes || i;
          return (a.date || a.foundAt || a.found_at || '').split('T')[0];
        })
        .filter(d => d.startsWith(mesAtual))
    );

    console.log(`[MDR] ${companyUuid.slice(0,8)}… → ${diasSet.size} dias, ${items.length} RDOs este mês (${Date.now() - t0}ms)`);
    return { diasComMDR: diasSet.size, mdrsNoMes: items.length, latencyMs: Date.now() - t0, error: null };
  } catch (e) {
    console.warn(`[MDR] ${companyUuid.slice(0,8)}… erro: ${e.message}`);
    return { diasComMDR: null, mdrsNoMes: null, latencyMs: Date.now() - t0, error: e.message };
  }
}

// ── Carga de todas as concessões — paralelo com semáforo ─────────────────────
export async function loadAllCompanies(token, companies, opts = {}) {
  const now             = new Date();
  const startOfMonth    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const quinzeDiasAtras = new Date(now.getTime() - 15 * 86_400_000).toISOString().split('T')[0];

  const settled = await Promise.allSettled(
    companies.map(async company => {
      // 7 requests por empresa:
      // users, reportings recentes, inventory (c/ itens), job, firm,
      // reportings do mês (dias de uso), fotos 15d via /Photo/ (fonte primária)
      const [u, r, inv, job, firm, rMes, photos] = await Promise.allSettled([
        listUsers(token, company.uuid, opts),
        listReportings(token, company.uuid, opts),
        listInventoryCounts(token, company.uuid),
        listJobProgress(token, company.uuid),
        listFirmCounts(token, company.uuid),
        listReportings(token, company.uuid, { foundAtAfter: startOfMonth,    pageSize: opts.pageSize || 100, maxPages: 3 }),
        listPhotosForCompany(token, company.uuid, { foundAtAfter: quinzeDiasAtras, pageSize: 100, maxPages: 5 }),
      ]);
      return {
        company,
        users:      u.status      === 'fulfilled' ? u.value      : { users: [],      totalCount: 0, latencyMs: 0, error: u.reason?.message },
        reportings: r.status      === 'fulfilled' ? r.value      : { reportings: [], totalCount: 0, latencyMs: 0, error: r.reason?.message },
        inventory:  inv.status    === 'fulfilled' ? inv.value    : { totalCount: null, withImageCount: null, inventoryItems: [], error: inv.reason?.message },
        job:        job.status    === 'fulfilled' ? job.value    : { totalJobs: null, totalThisMonth: null, avgProgress: null, error: job.reason?.message },
        firm:       firm.status   === 'fulfilled' ? firm.value   : { total: null, firms: [], error: firm.reason?.message },
        reportingsMes: rMes.status === 'fulfilled' ? rMes.value  : { reportings: [], totalCount: 0, error: rMes.reason?.message },
        photos15d:  photos.status === 'fulfilled' ? photos.value : { photos: [], reportingUuids: [], totalPhotos: null, error: photos.reason?.message },
      };
    })
  );

  return settled.map((r, i) =>
    r.status === 'fulfilled' ? r.value : {
      company:       companies[i],
      users:         { users: [],      totalCount: 0, error: r.reason?.message },
      reportings:    { reportings: [], totalCount: 0, error: r.reason?.message },
      inventory:     { totalCount: null, withImageCount: null, inventoryItems: [], error: r.reason?.message },
      job:           { totalJobs: null, totalThisMonth: null, avgProgress: null, error: r.reason?.message },
      firm:          { total: null, firms: [], error: r.reason?.message },
      reportingsMes: { reportings: [], totalCount: 0, error: r.reason?.message },
      photos15d:     { photos: [], reportingUuids: [], totalPhotos: null, error: r.reason?.message },
    }
  );
}

// ── Equipes — cadastro de Firms por concessão ─────────────────────────────────
export async function listFirmCounts(token, companyUuid) {
  if (!companyUuid) throw { step: 'firm', httpStatus: 400, message: 'company UUID obrigatório.' };
  const t0 = Date.now();
  try {
    const payload = await apiFetch(token, '/Firm/', { company: companyUuid, page: 1, page_size: 100 });
    const { items, totalCount } = extractPage(payload, 100);
    const firms = items.map(f => {
      const a = f.attributes || f;
      return {
        uuid: a.uuid || f.id,
        nome: a.name || a.nome || f.id || '—',
        ativo: a.active ?? true,
      };
    }).filter(f => f.ativo !== false);

    console.log(`[Firm] ${companyUuid.slice(0,8)}… → ${firms.length}/${totalCount} equipes ativas (${Date.now() - t0}ms)`);
    return { total: firms.length, totalCadastrado: totalCount, firms, latencyMs: Date.now() - t0, error: null };
  } catch (e) {
    console.warn(`[Firm] ${companyUuid.slice(0,8)}… erro: ${e.message}`);
    return { total: null, totalCadastrado: null, firms: [], latencyMs: Date.now() - t0, error: e.message };
  }
}

// ── Validação de programações — 4 estratégias em paralelo ────────────────────
// Retorna um relatório indicando qual estratégia retornou dados válidos e pode
// ser usada para calcular o indicador de programações no score de saúde.
export async function validateProgramacoes(token, companyUuid) {
  if (!companyUuid) throw { step: 'validate', httpStatus: 400, message: 'companyUuid obrigatório.' };

  const t0    = Date.now();
  const base  = { company: companyUuid, page: 1, page_size: 1 };
  const today = new Date().toISOString().split('T')[0];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  // Estratégias testadas em paralelo — cada uma isolada para não bloquear as outras
  const strategies = [
    {
      id:    'job_endpoint',
      label: 'Endpoint /Job/',
      desc:  'Busca programações diretamente no endpoint /Job/ — se existir, permite listar total e programadas no mês.',
      path:  '/Job/',
      params: base,
    },
    {
      id:    'inventory_com_job_historico',
      label: 'Inventários com job (histórico)',
      desc:  'GET /Inventory/?job__start_date_after=2020-01-01 — conta todos os inventários vinculados a alguma programação.',
      path:  '/Inventory/',
      params: { ...base, job__start_date_after: '2020-01-01' },
    },
    {
      id:    'inventory_com_job_mes',
      label: 'Inventários com job (mês corrente)',
      desc:  `GET /Inventory/?job__start_date_after=${startOfMonth} — inventários com programação iniciada no mês corrente.`,
      path:  '/Inventory/',
      params: { ...base, job__start_date_after: startOfMonth },
    },
    {
      id:    'inventory_job_isnull',
      label: 'Inventários com job via __isnull',
      desc:  'GET /Inventory/?job__isnull=false — convenção Django REST para filtrar registros com campo não-nulo.',
      path:  '/Inventory/',
      params: { ...base, job__isnull: 'false' },
    },
  ];

  // Busca o total bruto de inventários como referência de denominador
  let totalInventarios = null;
  try {
    const tot = await apiFetch(token, '/Inventory/', base);
    totalInventarios = extractPage(tot, 1).totalCount ?? null;
  } catch { /* ignora — já obtido em listInventoryCounts */ }

  const results = await Promise.all(
    strategies.map(async s => {
      try {
        const payload = await apiFetch(token, s.path, s.params);
        const { items, totalCount } = extractPage(payload, 1);
        const firstItem   = items[0] || null;
        const jobField    = firstItem?.job ?? firstItem?.attributes?.job ?? '(não inspecionado)';
        const pctDoCadastro = totalInventarios && totalCount !== null
          ? Math.round((totalCount / totalInventarios) * 100) : null;

        return {
          ...s,
          ok:         true,
          totalCount,
          pctDoCadastro,
          formato:    payload?.data?.results ? 'Reporting' : Array.isArray(payload?.data) ? 'JSON:API' : 'DRF',
          chaves:     firstItem ? Object.keys(firstItem) : [],
          jobField:   firstItem ? jobField : null,
          utilizavel: totalCount !== null && totalCount > 0,
        };
      } catch (e) {
        return {
          ...s,
          ok:         false,
          totalCount: null,
          utilizavel: false,
          erro:       e.message || `HTTP ${e.httpStatus}`,
        };
      }
    })
  );

  // Recomendação — primeira estratégia utilizável ganha
  const recomendada = results.find(r => r.utilizavel) ?? null;

  return {
    totalInventarios,
    strategies: results,
    recomendada: recomendada
      ? { id: recomendada.id, label: recomendada.label, totalCount: recomendada.totalCount, pctDoCadastro: recomendada.pctDoCadastro }
      : null,
    latencyMs: Date.now() - t0,
  };
}

// ── Todas as fotos de uma concessão — fonte primária do pilar "c/ Foto" ──────
// Tenta filtros diferentes até encontrar dados. Extrai o UUID do apontamento
// via relationships.reporting.data.id (JSON:API) para contar distintos.
export async function listPhotosForCompany(token, companyUuid, { foundAtAfter = '', pageSize = 100, maxPages = 5 } = {}) {
  if (!companyUuid) throw { step: 'photos-company', httpStatus: 400, message: 'company UUID obrigatório.' };
  const t0 = Date.now();

  const dateFilter = foundAtAfter ? { found_at_after: foundAtAfter } : {};

  const strategies = [
    { company: companyUuid,      ...dateFilter },
    { company_uuid: companyUuid, ...dateFilter },
    { company: companyUuid },            // sem filtro de data como fallback
  ];

  for (const params of strategies) {
    try {
      const result = await fetchPages(token, '/Photo/', { ...params, page_size: pageSize }, maxPages);
      if (result.totalCount === 0 && result.items.length === 0) continue;

      const photos = result.items.map(p => {
        const a   = p.attributes || p;
        const rel = p.relationships || {};
        const url = a.url || a.imageUrl || a.image_url || a.link || a.src
                 || a.file || a.fileUrl || a.file_url || null;
        if (!url) return null;
        const reportingUuid = rel.reporting?.data?.id
                           || a.reporting        || a.reporting_uuid
                           || a.reportingUuid    || null;
        return {
          id:            p.id || a.uuid,
          url,
          thumbnail:     a.thumbnailUrl || a.thumbnail_url || a.thumbnail || url,
          caption:       a.caption || a.description || a.obs || null,
          reportingUuid,
          foundAt:       a.foundAt || a.found_at || a.createdAt || a.created_at || null,
        };
      }).filter(Boolean);

      const reportingUuids = [...new Set(photos.map(p => p.reportingUuid).filter(Boolean))];

      console.log(`[Photos/co] ${companyUuid.slice(0,8)}… → ${photos.length}/${result.totalCount} fotos · ${reportingUuids.length} apontamentos distintos (${Date.now() - t0}ms)`);
      return {
        photos,
        reportingUuids,
        totalPhotos:    result.totalCount,
        totalFetched:   photos.length,
        usedParams:     Object.keys(params).join('+'),
        latencyMs:      Date.now() - t0,
        error:          null,
      };
    } catch (e) {
      // 404 = endpoint /Photo/ não existe nesta instância — interrompe imediatamente
      if (e.httpStatus === 404) {
        console.warn(`[Photos/co] ${companyUuid.slice(0,8)}… /Photo/ retornou 404 — endpoint indisponível para esta empresa`);
        return { photos: [], reportingUuids: [], totalPhotos: null, totalFetched: 0, usedParams: null, latencyMs: Date.now() - t0, error: 'endpoint /Photo/ não disponível (404)' };
      }
      console.warn(`[Photos/co] estratégia ${JSON.stringify(params)} falhou: ${e.message}`);
    }
  }

  // Todas as estratégias falharam por outros motivos (ex: 403, timeout)
  console.warn(`[Photos/co] ${companyUuid.slice(0,8)}… todas as estratégias falharam`);
  return { photos: [], reportingUuids: [], totalPhotos: null, totalFetched: 0, usedParams: null, latencyMs: Date.now() - t0, error: 'todas as estratégias falharam' };
}

// ── Fotos de um apontamento — tenta múltiplos endpoints Kartado ─────────────
export async function getReportingPhotos(token, reportingUuid) {
  if (!reportingUuid) throw { step: 'photos', httpStatus: 400, message: 'reportingUuid obrigatório.' };
  const t0 = Date.now();

  // Estratégias em ordem de probabilidade — para assim que encontrar resultados
  const strategies = [
    { path: '/Photo/', params: { reporting: reportingUuid, page_size: 50 } },
    { path: '/Photo/', params: { reporting_uuid: reportingUuid, page_size: 50 } },
    { path: '/Photo/', params: { object_id: reportingUuid, page_size: 50 } },
  ];

  for (const s of strategies) {
    try {
      const payload = await apiFetch(token, s.path, s.params);
      const { items, totalCount } = extractPage(payload, 50);
      if (items.length > 0) {
        const photos = items.map(p => {
          const a = p.attributes || p;
          const url = a.url || a.imageUrl || a.image_url || a.link || a.src
                   || a.file || a.fileUrl || a.file_url || null;
          if (!url) return null;
          return {
            id:        p.id || a.uuid || a.id,
            url,
            thumbnail: a.thumbnailUrl || a.thumbnail_url || a.thumbnail || url,
            caption:   a.caption || a.description || a.obs || null,
          };
        }).filter(Boolean);
        if (photos.length > 0) {
          return { photos, totalCount: totalCount || photos.length, strategy: Object.keys(s.params).join('+'), latencyMs: Date.now() - t0 };
        }
      }
    } catch (e) {
      if (e.httpStatus === 404) {
        console.warn(`[Photos] /Photo/ retornou 404 — endpoint indisponível`);
        break;
      }
      console.warn(`[Photos] estratégia ${JSON.stringify(s.params)} falhou: ${e.message}`);
    }
  }

  return { photos: [], totalCount: 0, strategy: null, latencyMs: Date.now() - t0 };
}

// ── Diagnóstico — paralelo via semáforo ──────────────────────────────────────
export async function runDiagnostics(token, sampleCompanyUuid = null) {
  const tests = [
    { key: 'company',   path: '/Company/',               params: { page: 1, page_size: 1 } },
    { key: 'user',      path: '/User/',                  params: { page: 1, page_size: 1, ...(sampleCompanyUuid ? { company: sampleCompanyUuid, active: 'true' } : {}) } },
    { key: 'reporting', path: '/Reporting/Spreadsheet/', params: { page: 1, page_size: 1, ...(sampleCompanyUuid ? { company: sampleCompanyUuid } : {}) } },
  ];

  const results = await Promise.all(
    tests.map(async t => {
      try {
        const payload = await apiFetch(token, t.path, t.params);
        const { items, totalCount } = extractPage(payload, 1);
        return [t.key, {
          status: 200, ok: true, totalCount,
          format:        payload?.data?.results ? 'Reporting-format' : Array.isArray(payload?.data) ? 'JSON:API' : 'DRF',
          topLevelKeys:  Object.keys(payload || {}),
          firstItemKeys: items[0] ? Object.keys(items[0]) : [],
        }];
      } catch (e) {
        return [t.key, { status: e.httpStatus || 0, ok: false, detail: e.message }];
      }
    })
  );

  return Object.fromEntries(results);
}

