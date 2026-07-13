function getEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error('Variaveis Supabase ausentes no servidor.');
  }

  return { publishableKey, secretKey, url };
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function supabaseRequest(path, options = {}) {
  const { secretKey, url } = getEnv();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  return parseJsonResponse(response);
}

async function getCaller(accessToken) {
  const { publishableKey, url } = getEnv();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseJsonResponse(response);
}

async function assertAdmin(headers) {
  const authorization = headers.authorization ?? headers.Authorization ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return { error: 'Sessao ausente.', status: 401 };
  }

  const caller = await getCaller(accessToken);
  const profiles = await supabaseRequest(
    `/rest/v1/app_profiles?select=id,email,role&id=eq.${encodeURIComponent(caller.id)}&limit=1`,
  );

  if (profiles[0]?.role !== 'admin') {
    return { error: 'Acesso restrito a administradores.', status: 403 };
  }

  return { caller, profile: profiles[0] };
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanDate(value) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data invalida: ${text}`);
  }

  return date.toISOString();
}

function mapTicketInput(body, userId) {
  const summary = cleanText(body.summary);
  const openedAt = cleanDate(body.openedAt);

  if (!summary) {
    throw new Error('Informe o resumo do chamado.');
  }

  if (!openedAt) {
    throw new Error('Informe a data de abertura.');
  }

  return {
    assigned_agent: cleanText(body.assignedAgent),
    assigned_group: cleanText(body.assignedGroup),
    assigned_to: cleanText(body.assignedTo),
    beneficiary_organization: cleanText(body.beneficiaryOrganization),
    case_number: cleanText(body.caseNumber),
    closed_at: cleanDate(body.closedAt),
    opened_at: openedAt,
    priority: cleanText(body.priority),
    reason: cleanText(body.reason),
    requested_for: cleanText(body.requestedFor),
    requester: cleanText(body.requester),
    requester_organization: cleanText(body.requesterOrganization),
    sla_status: cleanText(body.slaStatus),
    status: cleanText(body.status) ?? 'Novo',
    summary,
    ticket_type: cleanText(body.ticketType),
    updated_at: cleanDate(body.updatedAt),
    updated_by: userId,
  };
}

async function createTicket(body, caller) {
  const [ticket] = await supabaseRequest('/rest/v1/tickets', {
    body: JSON.stringify([{ ...mapTicketInput(body, caller.id), created_by: caller.id }]),
    method: 'POST',
  });

  return { body: ticket, status: 200 };
}

async function updateTicket(body, caller) {
  const id = cleanText(body.id);

  if (!id) {
    return { error: 'ID do chamado ausente.', status: 400 };
  }

  const [ticket] = await supabaseRequest(`/rest/v1/tickets?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify(mapTicketInput(body, caller.id)),
    method: 'PATCH',
  });

  return { body: ticket, status: 200 };
}

async function deleteTicket(body) {
  const id = cleanText(body.id);

  if (!id) {
    return { error: 'ID do chamado ausente.', status: 400 };
  }

  await supabaseRequest(`/rest/v1/tickets?id=eq.${encodeURIComponent(id)}`, {
    headers: { Prefer: 'return=minimal' },
    method: 'DELETE',
  });

  return { body: { id }, status: 200 };
}

export async function handleTicketsRequest({ body, headers, method }) {
  const adminCheck = await assertAdmin(headers);

  if (adminCheck.error) {
    return adminCheck;
  }

  if (method === 'POST') {
    return createTicket(body ?? {}, adminCheck.caller);
  }

  if (method === 'PATCH') {
    return updateTicket(body ?? {}, adminCheck.caller);
  }

  if (method === 'DELETE') {
    return deleteTicket(body ?? {});
  }

  return { error: 'Metodo nao permitido.', status: 405 };
}

export default async function handler(request, response) {
  try {
    const result = await handleTicketsRequest({
      body: request.body ?? {},
      headers: request.headers,
      method: request.method,
    });

    response.status(result.status).json(result.error ? { error: result.error } : result.body);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Erro inesperado.',
    });
  }
}
