import { query, withTransaction } from '../db.mjs';
import { AuditError, auditConfiguration, createAuditorClient } from './kartado-audit.service.mjs';

// O lock transacional limita a fila e os workers também entre réplicas do App Service.
const queueLock = 72819425;
export function createAuditJobRepository({ execute = query, transaction = withTransaction } = {}) {
return {
  async enqueue(userId, params) {
    return transaction(async client => {
      await client.query('select pg_advisory_xact_lock($1)', [queueLock]);
      const existing = await client.query(`select id, params from kartado_audit_jobs
        where user_id=$1 and status in ('queued','running')`, [userId]);
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (JSON.stringify(row.params, Object.keys(row.params).sort()) === JSON.stringify(params, Object.keys(params).sort())) return row.id;
        throw new AuditError('Você já possui uma busca em andamento. Aguarde sua conclusão.', 409);
      }
      const cooldown = await client.query(`select ceil(extract(epoch from max(retry_at)-now()))::int as seconds
        from kartado_audit_jobs where user_id=$1 and retry_at>now()`, [userId]);
      if (cooldown.rows[0]?.seconds > 0) throw new AuditError('Aguarde o intervalo solicitado pela integração antes de iniciar outra busca.', 429, cooldown.rows[0].seconds);
      const count = await client.query("select count(*)::int as total from kartado_audit_jobs where status in ('queued','running')");
      if (count.rows[0].total >= 20) throw new AuditError('Há muitas consultas em andamento. Tente novamente em alguns minutos.', 429, 60);
      const result = await client.query('insert into kartado_audit_jobs (user_id,params) values ($1,$2::jsonb) returning id', [userId, JSON.stringify(params)]);
      return result.rows[0].id;
    });
  },
  async claim() {
    return transaction(async client => {
      await client.query('select pg_advisory_xact_lock($1)', [queueLock]);
      await client.query(`update kartado_audit_jobs set status='failed', finished_at=now(),
        error='A consulta foi interrompida ou excedeu o tempo disponível. Inicie uma nova busca.'
        where (status='running' and started_at < now()-interval '16 minutes')
          or (status='queued' and created_at < now()-interval '20 minutes')`);
      await client.query('delete from kartado_audit_jobs where expires_at < now()');
      const count = await client.query("select count(*)::int as total from kartado_audit_jobs where status='running'");
      if (count.rows[0].total >= 2) return null;
      const result = await client.query(`update kartado_audit_jobs set status='running', started_at=now()
        where id=(select id from kartado_audit_jobs where status='queued' order by created_at limit 1 for update skip locked)
        returning id, params`);
      return result.rows[0] || null;
    });
  },
  async complete(id, result) {
    const payload = JSON.stringify(result);
    if (Buffer.byteLength(payload) > 40 * 1024 * 1024) throw new AuditError('O resultado excede o tamanho disponível. Consulte o período recente.');
    await execute(`update kartado_audit_jobs set status='completed',result=$2::jsonb,finished_at=now(),expires_at=now()+interval '1 hour'
      where id=$1 and status='running'`, [id, payload]);
  },
  async fail(id, error, retryAfter = 0) {
    await execute(`update kartado_audit_jobs set status='failed',error=$2,finished_at=now(),
      retry_at=case when $3::integer>0 then now()+($3::integer * interval '1 second') else null end
      where id=$1 and status='running'`, [id, error, retryAfter]);
  },
  async get(id, userId, includeResult = false) {
    const result = await execute(`select id,status,error,retry_at,params,created_at,started_at,finished_at${includeResult ? ',result' : ''}
      from kartado_audit_jobs where id=$1 and user_id=$2 and expires_at>now()`, [id, userId]);
    return result.rows[0] || null;
  },
  async active(userId) {
    const result = await execute(`select id from kartado_audit_jobs
      where user_id=$1 and status in ('queued','running') and expires_at>now() order by created_at desc limit 1`, [userId]);
    return result.rows[0] || null;
  },
};
}
export const auditJobRepository = createAuditJobRepository();

export function createAuditWorker({ repository = auditJobRepository, client = createAuditorClient(), enabled = () => auditConfiguration().provider === 'auditor' && auditConfiguration().configured } = {}) {
  let busy = false;
  let timer;
  let warned = false;
  async function tick() {
    if (busy || !enabled()) return;
    busy = true;
    try {
      const job = await repository.claim();
      warned = false;
      if (!job) return;
      try { await repository.complete(job.id, await client.reportings(job.params)); }
      catch (error) {
        const message = error instanceof AuditError ? error.message : 'Não foi possível concluir a busca. Tente novamente.';
        await repository.fail(job.id, message, error instanceof AuditError ? error.retryAfter || 0 : 0);
      }
    } catch {
      if (!warned) console.error('[Apontamentos] Fila indisponível. Verifique a migração e a conexão com o banco.');
      warned = true;
    } finally { busy = false; }
  }
  return {
    tick,
    start() { if (!timer) { timer = setInterval(() => void tick(), 5_000); timer.unref(); void tick(); } },
    stop() { clearInterval(timer); timer = undefined; },
  };
}
export const auditWorker = createAuditWorker();
