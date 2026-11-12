// Adaptador do contrato de inventário do Agente Auditor. Segredos ficam no servidor.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class InventoryError extends Error {
  constructor(message, status = 502, code = 'INTEGRATION_ERROR', details = null) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
const invalid = message => { throw new InventoryError(message, 400, 'INVALID_PARAM'); };
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string';
const nullableText = value => value == null || text(value);
const nullableCount = value => value === null || nonnegative(value);
const percentage = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 100);
const incompatible = () => { throw new InventoryError('O serviço de inventário retornou um contrato incompatível. Verifique se o backend foi atualizado.', 502, 'INCOMPATIBLE_CONTRACT'); };

export function inventoryParams(query, kind) {
  if (!query || typeof query !== 'object' || !text(query.concessao) || !UUID.test(query.concessao)) invalid('Concessão inválida.');
  const params = { concessao: query.concessao };
  for (const field of ['classe', 'rodovia']) {
    if (query[field] !== undefined && (!text(query[field]) || query[field].length > 250)) invalid(`Filtro ${field} inválido.`);
    if (query[field]?.trim()) params[field] = query[field].trim();
  }
  if (['resumo', 'cruzamento'].includes(kind)) {
    if (query.refresh !== undefined && !['0', '1'].includes(query.refresh)) invalid('Atualização inválida.');
    if (query.refresh === '1') params.refresh = '1';
  }
  if (kind === 'cruzamento') {
    for (const [field, fallback, values] of [['dimensao', 'classe', ['classe', 'rodovia', 'ativo']], ['periodo', 'recente', ['recente', 'completo']], ['filtro', 'com', ['com', 'sem']]]) {
      params[field] = query[field] ?? fallback;
      if (!values.includes(params[field])) invalid(`Filtro ${field} inválido.`);
    }
    if (query.status !== undefined && (!text(query.status) || query.status.length > 250)) invalid('Status inválido.');
    if (query.status?.trim()) params.status = query.status.trim();
    if (params.filtro === 'sem' && params.status) throw new InventoryError('Sem apontamento considera qualquer status. Remova o status selecionado.', 400, 'FILTRO_INCOMPATIVEL');
  }
  if (kind !== 'resumo') {
    for (const [field, fallback, max] of [['page', 1, 1_000_000], ['page_size', 100, kind === 'itens' ? 200 : kind === 'apontamentos' ? 500 : 1000]]) {
      const raw = query[field] ?? String(fallback);
      if (!text(raw) || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) invalid(`Paginação ${field} inválida.`);
      params[field] = String(Number(raw));
    }
  }
  return params;
}

function validQuality(source) {
  const integrity = source?.integridade, freshness = source?.atualidade, update = source?.atualizacao;
  return typeof integrity?.completa === 'boolean' && nonnegative(integrity.esperados) && nonnegative(integrity.recebidos)
    && Array.isArray(integrity.motivos) && integrity.motivos.every(text)
    && text(freshness?.geradoEm) && Number.isFinite(Date.parse(freshness.geradoEm))
    && Number.isFinite(freshness.idadeSeg) && freshness.idadeSeg >= 0
    && Number.isFinite(freshness.validadeSeg) && freshness.validadeSeg > 0 && typeof freshness.expirado === 'boolean'
    && ['ociosa', 'em_andamento', 'falhou', 'incompleta'].includes(update?.estado);
}
export function validateInventoryResponse(data, kind, params, status = 200) {
  if (data?.success !== true) incompatible();
  if (status === 202) {
    if (!['resumo', 'cruzamento'].includes(kind) || data.status !== 'processando' || !text(data.etapa)
      || !Number.isFinite(Date.parse(data.iniciadoEm)) || !nonnegative(data.decorridoSeg)) incompatible();
    return data;
  }
  if (data.companyUuid !== params.concessao) incompatible();
  if (kind === 'resumo' || kind === 'cruzamento') {
    if (data.status !== 'pronto' || typeof data.coletaCompleta !== 'boolean' || !validQuality(data.coleta?.inventario)
      || !Array.isArray(data.avisos) || !data.avisos.every(text)) incompatible();
    if (kind === 'cruzamento' && !validQuality(data.coleta?.apontamentos)) incompatible();
    const complete = data.coleta.inventario.integridade.completa && (kind !== 'cruzamento' || data.coleta.apontamentos.integridade.completa);
    if (complete !== data.coletaCompleta) incompatible();
  }
  if (kind === 'resumo') {
    if (!nonnegative(data.totalInventarioConcessao) || !nonnegative(data.totalRecebido) || !nonnegative(data.totalFiltrado)
      || !nonnegative(data.comFoto) || data.comFoto > data.totalFiltrado || data.totalFiltrado > data.totalRecebido
      || !percentage(data.pctComFoto) || (!data.coletaCompleta && data.pctComFoto !== null)) incompatible();
    for (const [field, key] of [['porClasse', 'classe'], ['porRodovia', 'rodovia']]) {
      if (!Array.isArray(data[field]) || data[field].some(row => !text(row[key]) || !nonnegative(row.total) || !nonnegative(row.comFoto) || row.comFoto > row.total || !percentage(row.pctComFoto) || (!data.coletaCompleta && row.pctComFoto !== null))
        || data[field].reduce((sum, row) => sum + row.total, 0) !== data.totalFiltrado
        || data[field].reduce((sum, row) => sum + row.comFoto, 0) !== data.comFoto) incompatible();
    }
  }
  if (kind === 'cruzamento') {
    const totals = data.totais;
    if (data.dimensao !== params.dimensao || data.periodo !== params.periodo || !Array.isArray(data.linhas)
      || !totals || !['ativosNoRecorte', 'ativosComApontamento', 'apontamentosNoRecorte'].every(k => nonnegative(totals[k]))
      || totals.ativosComApontamento > totals.ativosNoRecorte
      || !nullableCount(totals.ativosSemApontamento) || !percentage(totals.pctAtivosComApontamento)
      || (!data.coletaCompleta && (totals.ativosSemApontamento !== null || totals.pctAtivosComApontamento !== null))
      || (data.coletaCompleta && totals.ativosSemApontamento !== totals.ativosNoRecorte - totals.ativosComApontamento)) incompatible();
    if (params.status && !['ativosComApontamentoNoStatus', 'apontamentosNoStatus'].every(k => nonnegative(totals[k]))) incompatible();
    if (params.dimensao === 'ativo') {
      if (!nonnegative(data.totalLinhas) || data.totalLinhas < data.linhas.length || !Number.isSafeInteger(data.totalPaginas) || data.totalPaginas < 1
        || !Number.isSafeInteger(data.pagina) || data.pagina < 1
        || new Set(data.linhas.map(row => row.uuid)).size !== data.linhas.length
        || data.linhas.some(row => !UUID.test(row.uuid) || !text(row.classe) || !text(row.rodovia) || !nonnegative(row.apontamentos))) incompatible();
    } else {
      if (!Array.isArray(data.statusEncontrados) || !data.statusEncontrados.every(text)
        || data.linhas.some(row => !text(row[params.dimensao]) || !['ativos', 'ativosComApontamento', 'apontamentos'].every(k => nonnegative(row[k]))
          || !nullableCount(row.ativosSemApontamento) || !percentage(row.pctAtivosComApontamento)
          || (!data.coletaCompleta && (row.ativosSemApontamento !== null || row.pctAtivosComApontamento !== null))
          || (params.status && !['ativosComApontamentoNoStatus', 'apontamentosNoStatus'].every(k => nonnegative(row[k]))))
        || data.linhas.reduce((sum, row) => sum + row.ativos, 0) !== totals.ativosNoRecorte
        || data.linhas.reduce((sum, row) => sum + row.ativosComApontamento, 0) !== totals.ativosComApontamento
        || data.linhas.reduce((sum, row) => sum + row.apontamentos, 0) !== totals.apontamentosNoRecorte) incompatible();
    }
  }
  if (kind === 'itens' || kind === 'apontamentos') {
    const rows = kind === 'itens' ? data.itens : data.apontamentos;
    const total = kind === 'itens' ? data.totalItens : data.totalApontamentos;
    if (!Array.isArray(rows) || !nonnegative(total) || !Number.isSafeInteger(data.pagina) || data.pagina < 1
      || !Number.isSafeInteger(data.totalPaginas) || data.totalPaginas < 1
      || rows.length > total || new Set(rows.map(row => row.uuid)).size !== rows.length
      || rows.some(row => !UUID.test(row.uuid) || !['numero', 'classe', 'rodovia', 'link'].every(k => nullableText(row[k])))) incompatible();
    if (kind === 'apontamentos' && (typeof data.catalogosCompletos !== 'boolean' || !Array.isArray(data.avisos) || !data.avisos.every(text))) incompatible();
  }
  return data;
}

export function createInventoryClient({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    async request(kind, query, assetUuid = null) {
      if (!['resumo', 'cruzamento', 'itens', 'apontamentos'].includes(kind)) invalid('Consulta inválida.');
      const params = inventoryParams(query, kind);
      if (kind === 'apontamentos' && (!text(assetUuid) || !UUID.test(assetUuid))) invalid('Ativo inválido.');
      if (!env.AGENTE_AUDITOR_BASE_URL || !env.MONITORAMENTO_API_KEY) throw new InventoryError('A integração de inventário ainda não foi configurada no servidor.', 503, 'NOT_CONFIGURED');
      let base;
      try { base = new URL(env.AGENTE_AUDITOR_BASE_URL); } catch { throw new InventoryError('Endereço do serviço de inventário inválido.', 503, 'NOT_CONFIGURED'); }
      if (base.protocol !== 'https:' || base.username || base.password) throw new InventoryError('O serviço de inventário exige HTTPS sem credenciais na URL.', 503, 'NOT_CONFIGURED');
      const path = kind === 'apontamentos' ? `${assetUuid}/apontamentos` : kind;
      const url = new URL(`/api/v1/monitoramento/inventario/${path}`, base.origin);
      url.search = new URLSearchParams(params).toString();
      try {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'x-api-key': env.MONITORAMENTO_API_KEY }, signal: AbortSignal.timeout(45_000), redirect: 'error' });
        const data = await response.json().catch(() => null);
        const retry = Number(response.headers.get('Retry-After')) || 15;
        const retryAfter = Math.min(300, Math.max(1, Math.ceil(retry)));
        if (![200, 202].includes(response.status)) {
          const codes = { FILTRO_INCOMPATIVEL: [400, 'Sem apontamento não pode ser combinado com status.'], COLETA_PARCIAL: [409, 'Aguarde a coleta completa para consultar ativos sem apontamento.'], CLASSE_NAO_ENCONTRADA: [404, 'Classe não encontrada nesta concessão.'], CATALOGO_INCOMPLETO: [503, 'Catálogo de classes incompleto. Tente novamente mais tarde.'] };
          const known = codes[data?.code];
          const details = data?.code === 'COLETA_PARCIAL' && validQuality(data.detalhes?.coleta?.inventario) && validQuality(data.detalhes?.coleta?.apontamentos) ? { coleta: data.detalhes.coleta } : null;
          throw new InventoryError(known?.[1] || (response.status === 429 ? 'Limite de consultas atingido. Aguarde e tente novamente.' : 'O serviço de inventário está indisponível. Tente novamente mais tarde.'), known?.[0] || (response.status === 429 ? 429 : 502), known ? data.code : 'INTEGRATION_ERROR', details);
        }
        return { status: response.status, retryAfter, data: validateInventoryResponse(data, kind, params, response.status) };
      } catch (error) {
        if (error instanceof InventoryError) throw error;
        if (['TimeoutError', 'AbortError'].includes(error?.name)) throw new InventoryError('A consulta ao inventário excedeu o tempo disponível. Tente novamente.', 504, 'TIMEOUT');
        throw new InventoryError('Não foi possível comunicar com o serviço de inventário.');
      }
    },
  };
}
