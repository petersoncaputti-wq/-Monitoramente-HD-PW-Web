function config() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secretKey) throw new Error('Credenciais administrativas do Supabase ausentes.');
  return { secretKey, url };
}

export async function supabaseAdminRequest(path, options = {}) {
  const { secretKey, url } = config();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Erro Supabase ${response.status}.`);
  return text ? JSON.parse(text) : null;
}
