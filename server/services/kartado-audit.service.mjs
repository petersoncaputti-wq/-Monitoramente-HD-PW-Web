export class AuditError extends Error {
  constructor(message, status = 502, retryAfter = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function auditConfiguration(env = process.env) {
  return {
    provider: env.KARTADO_REPORTINGS_PROVIDER === 'auditor' ? 'auditor' : 'legacy',
    configured: Boolean(env.AGENTE_AUDITOR_BASE_URL && env.MONITORAMENTO_API_KEY),
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCompany(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new AuditError('Concessão inválida.', 400);
  return value;
}

export function validateAuditParams(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuditError('Filtros inválidos.', 400);
  const concessao = validateCompany(body.concessao);
  const origem = typeof body.origem === 'string' ? body.origem.trim() : '';
  if (!origem || origem.length > 200) throw new AuditError('Informe uma origem com até 200 caracteres.', 400);
  const periodo = body.periodo ?? 'recente';
  if (!['recente', 'completo'].includes(periodo)) throw new AuditError('Período inválido.', 400);
  if (body.refresh !== undefined && typeof body.refresh !== 'boolean') throw new AuditError('Atualização inválida.', 400);
  return { concessao, origem, periodo, refresh: body.refresh === true };
}

// Preserva os diagnósticos de resultados parciais; não aceita payloads silenciosamente vazios.
export function validateAuditResult(data, params) {
  if (data?.success !== true || !Array.isArray(data.items)
    || data.companyUuid !== params.concessao || data.origem !== params.origem
    || data.periodo !== params.periodo || !Number.isInteger(data.totalFiltrado)
    || data.totalFiltrado !== data.items.length
    || !Number.isInteger(data.totalConcessaoNaJanela) || data.totalConcessaoNaJanela < 0
    || !Number.isInteger(data.fetchFailedPages) || data.fetchFailedPages < 0
    || typeof data.trechoDisponivel !== 'boolean'
    || !Array.isArray(data.naturezasExcluidas) || data.naturezasExcluidas.some(value => typeof value !== 'string')
    || !Array.isArray(data.origensDisponiveis)
    || data.origensDisponiveis.some(value => !value || typeof value.origem !== 'string' || !Number.isFinite(value.total))) {
    throw new AuditError('A integração retornou um resultado incompatível. Tente novamente ou contate o suporte.');
  }
  const ids = new Set();
  for (const item of data.items) {
    if (!item || typeof item.uuid !== 'string' || ids.has(item.uuid)
      || ['status', 'natureza', 'classe', 'rodovia', 'trecho', 'origem', 'numero', 'dataCriacao', 'dataVencimento', 'dataExecucao', 'link'].some(key => item[key] != null && typeof item[key] !== 'string')
      || (item.origem ?? 'Sem origem informada') !== params.origem) {
      throw new AuditError('A integração retornou registros duplicados ou fora da origem solicitada.');
    }
    ids.add(item.uuid);
  }
  return data;
}

export function createAuditorClient({ env = process.env, fetchImpl = fetch } = {}) {
  async function request(path, timeoutMs = 45_000) {
    if (!auditConfiguration(env).configured) throw new AuditError('A integração de apontamentos ainda não foi configurada no servidor.', 503);
    let base;
    try { base = new URL(env.AGENTE_AUDITOR_BASE_URL); } catch { throw new AuditError('Endereço da integração inválido.', 503); }
    if (base.protocol !== 'https:' || base.username || base.password) throw new AuditError('A integração exige um endereço HTTPS sem credenciais na URL.', 503);
    const url = new URL(`/api/v1/monitoramento/${path}`, base.origin);
    try {
      const response = await fetchImpl(url, {
        headers: { 'x-api-key': env.MONITORAMENTO_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) {
        const retry = Number(response.headers.get('Retry-After'));
        const retryAfter = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60;
        const messages = {
          400: 'A integração recusou os filtros informados.',
          401: 'A chave da integração não foi aceita. Acione o administrador.',
          403: 'A integração não autorizou esta consulta.',
          429: 'Limite de consultas atingido. Aguarde antes de tentar novamente.',
          503: 'O serviço de apontamentos está temporariamente indisponível.',
        };
        throw new AuditError(messages[response.status] || 'Falha ao consultar o serviço de apontamentos.',
          response.status === 429 ? 429 : response.status === 400 ? 400 : 502,
          response.status === 429 ? retryAfter : null);
      }
      const data = await response.json();
      if (data?.success !== true) throw new AuditError('A integração não confirmou o sucesso da consulta.');
      return data;
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new AuditError('A busca excedeu o tempo disponível. Tente o período recente ou tente novamente mais tarde.', 504);
      // Não propaga URLs, headers, corpos ou detalhes que possam conter segredos.
      throw new AuditError('Não foi possível comunicar com o serviço de apontamentos.');
    }
  }
  return {
    companies: async () => {
      const data = await request('concessoes');
      if (!Array.isArray(data.concessoes) || data.concessoes.some(c => !uuidPattern.test(c.uuid) || typeof c.nome !== 'string')) throw new AuditError('Lista de concessões inválida.');
      return data;
    },
    origins: async (company) => {
      const data = await request(`apontamentos/origens?${new URLSearchParams({ concessao: validateCompany(company) })}`);
      if (!Array.isArray(data.origensAmostra) || data.origensAmostra.some(value => !value || typeof value.origem !== 'string' || !Number.isFinite(value.total))) throw new AuditError('Lista de origens inválida.');
      return data;
    },
    reportings: async (params) => {
      const query = new URLSearchParams({ concessao: params.concessao, origem: params.origem, periodo: params.periodo, refresh: params.refresh ? '1' : '0' });
      return validateAuditResult(await request(`apontamentos?${query}`, 15 * 60_000), params);
    },
  };
}
