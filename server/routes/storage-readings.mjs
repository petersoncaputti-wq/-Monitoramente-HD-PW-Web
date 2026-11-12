import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { query } from '../db.mjs';
import { clientIpKeyGenerator } from '../rate-limit-ip.mjs';

export function validateReading(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Envie uma leitura JSON.');
  const { Data: date, Hora: time, Computador: computer, Unidade: unit } = body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Data inválida: use yyyy-MM-dd.');
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) throw new Error('Hora inválida: use HH:mm:ss.');
  if (typeof computer !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(computer)) throw new Error('Computador inválido.');
  if (typeof unit !== 'string' || !/^[a-zA-Z]:$/.test(unit)) throw new Error('Unidade inválida: use E:.');
  const values = ['TotalGB', 'UsadoGB', 'LivreGB', 'PercentualUsado', 'PercentualLivre'].map((key) => {
    const value = body[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) throw new Error(`${key} deve ser um número válido e não negativo.`);
    return value;
  });
  const [total, used, free, percentUsed, percentFree] = values;
  if (total <= 0 || used > total + 0.02 || free > total + 0.02 || Math.abs(used + free - total) > 0.03
      || percentUsed > 100 || percentFree > 100 || Math.abs(percentUsed + percentFree - 100) > 0.03
      || Math.abs(percentUsed - used / total * 100) > 0.1 + 1 / total) throw new Error('Os valores de capacidade e percentuais são inconsistentes.');
  // The existing CSV collector records local São Paulo wall-clock time.
  return [date, time, `${date}T${time}-03:00`, computer.toUpperCase(), unit.toUpperCase(), ...values];
}

export function createStorageReadingsRouter({ execute = query, getToken = () => process.env.STORAGE_COLLECTOR_TOKEN } = {}) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: clientIpKeyGenerator, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.post('/', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const expected = getToken();
    if (!expected || expected.length < 32) return response.status(503).json({ error: 'Coletor não configurado no servidor.' });
    const authorization = request.get('authorization') || '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const hash = (value) => createHash('sha256').update(value).digest();
    if (!supplied || !timingSafeEqual(hash(supplied), hash(expected))) return response.status(401).json({ error: 'Credencial do coletor inválida.' });
    let values;
    try { values = validateReading(request.body); }
    catch (error) { return response.status(400).json({ error: error.message }); }
    await execute(
      `insert into storage_readings
       (reading_date,reading_time,observed_at,computer,unit,total_gb,used_gb,free_gb,percent_used,percent_free)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (observed_at,computer,unit) do update set
       total_gb=excluded.total_gb,used_gb=excluded.used_gb,free_gb=excluded.free_gb,
       percent_used=excluded.percent_used,percent_free=excluded.percent_free,updated_at=now()`, values,
    );
    return response.json({ status: 'ok', computer: values[3], unit: values[4], observedAt: values[2] });
  });
  return router;
}

export default createStorageReadingsRouter();
