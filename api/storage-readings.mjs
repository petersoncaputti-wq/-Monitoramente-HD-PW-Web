import { requireUser } from './_auth.mjs';
import { query } from './_database.mjs';

export async function handleStorageReadingsRequest({ headers = {}, method, query: params = {} }) {
  if (method !== 'GET') return { error: 'Metodo nao permitido.', status: 405 };
  const auth = await requireUser(headers);
  if (auth.error) return auth;
  const limit = Math.min(Math.max(Number(params.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const result = await query(
    `select reading_date, reading_time, computer, unit, total_gb, used_gb, free_gb,
            percent_used, percent_free
       from storage_readings order by observed_at asc limit $1 offset $2`,
    [limit, offset],
  );
  return { body: result.rows, status: 200 };
}
