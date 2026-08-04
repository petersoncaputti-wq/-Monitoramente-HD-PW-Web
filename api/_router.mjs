import { handleAdminUsersRequest } from './admin-users.mjs';
import { handleProfileRequest } from './profile.mjs';
import { handleProjectWiseUsersImportRequest } from './pw-users-import.mjs';
import { handlePwUsersRequest } from './pw-users.mjs';
import { handleStorageImportRequest } from './storage-import.mjs';
import { handleStorageReadingsRequest } from './storage-readings.mjs';
import { handleTicketsRequest } from './tickets.mjs';
import { query } from './_database.mjs';

export async function handleApiRequest({ body = {}, headers = {}, method = 'GET', url }) {
  const parsed = url instanceof URL ? url : new URL(url, 'http://localhost');
  const request = { body, headers, method, query: Object.fromEntries(parsed.searchParams.entries()) };
  if (parsed.pathname === '/api/health' && method === 'GET') {
    await query('select 1');
    return { body: { database: 'connected', status: 'ok' }, status: 200 };
  }
  if (parsed.pathname === '/api/profile') return handleProfileRequest(request);
  if (parsed.pathname === '/api/admin-users') return handleAdminUsersRequest(request);
  if (parsed.pathname === '/api/tickets') return handleTicketsRequest(request);
  if (parsed.pathname === '/api/storage-readings') return handleStorageReadingsRequest(request);
  if (parsed.pathname === '/api/storage-import') return handleStorageImportRequest(request);
  if (parsed.pathname === '/api/pw-users') return handlePwUsersRequest(request);
  if (parsed.pathname === '/api/pw-users-import') return handleProjectWiseUsersImportRequest(request);
  return { error: 'Endpoint nao encontrado.', status: 404 };
}
