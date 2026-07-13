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

function getArgValues(name) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length).trim().toLowerCase())
    .filter(Boolean);
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
      'User-Agent': 'auth-profile-sync-script/1.0',
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
  const adminEmails = new Set([
    ...(env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    ...getArgValues('admin-email'),
  ]);

  const result = await supabaseRequest(env, '/auth/v1/admin/users');
  const users = result.users ?? [];

  if (users.length === 0) {
    console.log(JSON.stringify({ synced: 0, message: 'Nenhum usuario Auth encontrado.' }));
    return;
  }

  const profiles = users
    .filter((user) => user.id && user.email)
    .map((user) => ({
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      id: user.id,
      role: adminEmails.has(String(user.email).toLowerCase()) ? 'admin' : 'user',
    }));

  const syncedProfiles = await supabaseRequest(env, '/rest/v1/app_profiles?on_conflict=id', {
    body: JSON.stringify(profiles),
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    method: 'POST',
  });

  console.log(
    JSON.stringify({
      admins: [...adminEmails],
      synced: syncedProfiles.length,
      users: syncedProfiles.map((profile) => ({
        email: profile.email,
        role: profile.role,
      })),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
