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
      'User-Agent': 'admin-users-api/1.0',
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
    return { error: 'Sessão ausente.', status: 401 };
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

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

function getCreatedUser(authResponse) {
  const user = authResponse?.user ?? authResponse;

  if (!user?.id || typeof user.id !== 'string') {
    throw new Error('O Supabase criou o usuário, mas não retornou um ID válido.');
  }

  return user;
}

async function listProfiles() {
  return supabaseRequest('/rest/v1/app_profiles?select=*&order=email.asc');
}

async function createUser(body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.fullName ?? '').trim();
  const role = normalizeRole(body.role);

  if (!email || !password) {
    return { error: 'Email e senha sao obrigatórios.', status: 400 };
  }

  const authResponse = await supabaseRequest('/auth/v1/admin/users', {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: fullName,
      },
    }),
    method: 'POST',
  });
  const user = getCreatedUser(authResponse);

  try {
    const profiles = await supabaseRequest('/rest/v1/app_profiles?on_conflict=id', {
      body: JSON.stringify([
        {
          email,
          full_name: fullName || null,
          id: user.id,
          role,
        },
      ]),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    });

    if (!profiles[0]) {
      throw new Error('O perfil do usuário não foi retornado pelo Supabase.');
    }

    return { body: profiles[0], status: 201 };
  } catch (profileError) {
    try {
      await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
    } catch (rollbackError) {
      const profileMessage =
        profileError instanceof Error ? profileError.message : 'Erro ao criar o perfil.';
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : 'Erro ao desfazer a criação.';

      throw new Error(
        `${profileMessage} Também não foi possível remover o usuário criado: ${rollbackMessage}`,
      );
    }

    throw profileError;
  }
}

async function updateUser(body) {
  const id = String(body.id ?? '').trim();
  const fullName = String(body.fullName ?? '').trim();
  const role = normalizeRole(body.role);

  if (!id) {
    return { error: 'ID do usuário e obrigatório.', status: 400 };
  }

  const profiles = await supabaseRequest(`/rest/v1/app_profiles?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify({
      full_name: fullName || null,
      role,
    }),
    method: 'PATCH',
  });

  if (!profiles[0]) {
    return { error: 'Usuário não encontrado.', status: 404 };
  }

  await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    body: JSON.stringify({
      user_metadata: {
        full_name: fullName,
      },
    }),
    method: 'PUT',
  }).catch(() => null);

  return { body: profiles[0], status: 200 };
}

async function deleteUser(body) {
  const id = String(body.id ?? '').trim();

  if (!id) {
    return { error: 'ID do usuário e obrigatório.', status: 400 };
  }

  await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  return { body: { id }, status: 200 };
}

export async function handleAdminUsersRequest({ body, headers, method }) {
  const adminCheck = await assertAdmin(headers);

  if (adminCheck.error) {
    return adminCheck;
  }

  if (method === 'GET') {
    return { body: await listProfiles(), status: 200 };
  }

  if (method === 'POST') {
    return createUser(body ?? {});
  }

  if (method === 'PATCH') {
    return updateUser(body ?? {});
  }

  if (method === 'DELETE') {
    return deleteUser(body ?? {});
  }

  return { error: 'Método não permitido.', status: 405 };
}

export default async function handler(request, response) {
  try {
    const result = await handleAdminUsersRequest({
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
