import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  const content = readFileSync(path, 'utf-8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return values;
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function supabaseRequest(env, path, options = {}) {
  const baseUrl = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceKey) {
    throw new Error('Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'auth-admin-script/1.0',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status} ao chamar Supabase.`);
  }

  return response.json();
}

async function main() {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const env = {
    ...process.env,
    ...readEnvFile(resolve(rootDir, '.env.local')),
  };
  const email = getArgValue('email');
  const password = getArgValue('password');
  const role = getArgValue('role') ?? 'user';
  const fullName = getArgValue('name') ?? '';

  if (!email || !password) {
    throw new Error(
      'Uso: npm run auth:create-user -- --email=usuario@empresa.com --password=SenhaForte --role=admin --name="Nome"',
    );
  }

  if (!['admin', 'user'].includes(role)) {
    throw new Error('Role invalida. Use admin ou user.');
  }

  const user = await supabaseRequest(env, '/auth/v1/admin/users', {
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    }),
    method: 'POST',
  });

  const profilePayload = {
    email,
    full_name: fullName || null,
    id: user.id,
    role,
  };

  await supabaseRequest(env, '/rest/v1/app_profiles?on_conflict=id', {
    body: JSON.stringify([profilePayload]),
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    method: 'POST',
  });

  console.log(
    JSON.stringify({
      email,
      id: user.id,
      role,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
