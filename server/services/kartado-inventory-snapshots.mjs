import { randomUUID } from 'node:crypto';
import { query } from '../db.mjs';
import { createInventoryClient, inventoryParams, InventoryError } from './kartado-inventory.service.mjs';

// Somente agregados pequenos e sem filtros. Detalhes continuam na origem.
export function snapshotTarget(kind, query) {
  if (!['resumo', 'cruzamento'].includes(kind)) return null;
  const params = inventoryParams(query, kind);
  delete params.refresh;
  if (params.classe || params.rodovia || params.status) return null;
  if (kind === 'cruzamento' && (params.periodo !== 'recente' || params.dimensao === 'ativo' || params.filtro !== 'com' || params.page !== '1')) return null;
  if (kind === 'cruzamento') params.page_size = '100';
  const sorted = new URLSearchParams(params); sorted.sort();
  return { key: `${kind}?${sorted}`, kind, params };
}

export function createSnapshotRepository({ execute = query } = {}) {
  return {
    async register(target) {
      await execute(`insert into kartado_inventory_snapshots (cache_key, company_uuid, kind, params)
        values ($1,$2,$3,$4::jsonb) on conflict (cache_key) do update set last_used_at=now()`,
      [target.key, target.params.concessao, target.kind, JSON.stringify(target.params)]);
    },
    async get(key) { return (await execute('select * from kartado_inventory_snapshots where cache_key=$1', [key])).rows[0] || null; },
    async refresh(company) {
      await execute(`update kartado_inventory_snapshots set refresh_requested=true, next_attempt_at=now(), last_error=null,
        last_refresh_at=now(), lease_until=null, lease_token=null, update_state='em_andamento'
        where company_uuid=$1 and (last_refresh_at is null or last_refresh_at<now()-interval '5 minutes')`, [company]);
    },
    async claim() {
      // O token da lease impede uma resposta atrasada de sobrescrever outro worker.
      const token = randomUUID();
      const result = await execute(`update kartado_inventory_snapshots set lease_until=now()+interval '90 seconds',
        lease_token=$1, update_state='em_andamento'
        where cache_key=(select cache_key from kartado_inventory_snapshots
          where next_attempt_at<=now() and (lease_until is null or lease_until<now())
          and last_used_at>now()-interval '7 days'
          order by next_attempt_at for update skip locked limit 1)
        returning *`, [token]);
      return result.rows[0] || null;
    },
    async complete(row, data, retryAfter = null) {
      if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024) throw new Error('Snapshot muito grande.');
      const remaining = Object.values(data.coleta).filter(Boolean).map(source => Math.max(30, Math.floor(source.atualidade.validadeSeg - source.atualidade.idadeSeg)));
      const delay = retryAfter ?? Math.min(600, ...remaining);
      await execute(`update kartado_inventory_snapshots set
        payload=case when $3::boolean or payload is null or not coalesce((payload->>'coletaCompleta')::boolean,false) then $2::jsonb else payload end,
        saved_at=case when $3::boolean or payload is null or not coalesce((payload->>'coletaCompleta')::boolean,false) then now() else saved_at end,
        next_attempt_at=now()+($6::integer * interval '1 second'), lease_until=null, lease_token=null,
        refresh_requested=case when $5::integer is null then false else refresh_requested end,
        last_error=case when $3::boolean then null else 'A última coleta foi parcial; o resultado anterior foi preservado quando disponível.' end,
        update_state=case when $5::integer is not null then 'em_andamento' when $3::boolean then 'ociosa' else 'incompleta' end
        where cache_key=$1 and lease_token=$4`, [row.cache_key, JSON.stringify(data), data.coletaCompleta, row.lease_token, retryAfter, delay]);
    },
    async retry(row, seconds, error = null) {
      await execute(`update kartado_inventory_snapshots set lease_until=null, lease_token=null,
        next_attempt_at=now()+($2::integer * interval '1 second'), last_error=$3,
        update_state=case when $3::text is null then 'em_andamento' else 'falhou' end
        where cache_key=$1 and lease_token=$4`, [row.cache_key, seconds, error, row.lease_token]);
    },
  };
}

export function snapshotResponse(row, now = Date.now()) {
  if (!row.payload && row.update_state === 'falhou') throw new InventoryError(row.last_error || 'Não foi possível preparar o inventário.', 503, 'SNAPSHOT_UNAVAILABLE');
  if (!row.payload) return { status: 202, retryAfter: 5, data: {
    success: true, status: 'processando', etapa: row.kind === 'resumo' ? 'inventario' : 'cruzamento',
    iniciadoEm: new Date(row.created_at).toISOString(), decorridoSeg: Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 1000)), tentarNovamenteEmSeg: 5,
  } };
  const data = structuredClone(row.payload);
  const elapsed = Math.max(0, (now - new Date(row.saved_at).getTime()) / 1000);
  const due = new Date(row.next_attempt_at).getTime() <= now;
  for (const source of Object.values(data.coleta)) {
    if (!source) continue;
    source.atualidade.idadeSeg += elapsed;
    source.atualidade.expirado ||= source.atualidade.idadeSeg >= source.atualidade.validadeSeg;
    source.atualizacao = { estado: row.update_state === 'falhou' || row.update_state === 'incompleta' ? row.update_state
      : row.lease_until || due || row.update_state === 'em_andamento' ? 'em_andamento' : source.atualizacao.estado,
      ...(row.last_error && { erro: row.last_error, motivos: [row.last_error] }) };
  }
  if (row.last_error && !data.avisos.includes(row.last_error)) data.avisos.push(row.last_error);
  return { status: 200, retryAfter: 5, data };
}

export function createSnapshotWorker({ repository, client, enabled = () => true, log = console.error } = {}) {
  let timer, busy = false, warned = false;
  async function tick() {
    if (busy || !enabled()) return;
    busy = true;
    try {
      const row = await repository.claim();
      warned = false;
      if (!row) return;
      try {
        const result = await client.request(row.kind, { ...row.params, ...(row.refresh_requested && { refresh: '1' }) });
        if (result.status === 202) await repository.retry(row, result.retryAfter);
        else {
          const ongoing = Object.values(result.data.coleta).some(source => source?.atualizacao.estado === 'em_andamento');
          // Persiste os dados disponíveis sem iniciar outra atualização a cada poll.
          await repository.complete(row, result.data, ongoing ? result.retryAfter : null);
        }
      } catch {
        await repository.retry(row, 300, 'Não foi possível atualizar o inventário. O último resultado disponível foi preservado.');
      }
    } catch {
      if (!warned) log('[Inventário] Persistência indisponível. Verifique a migração e a conexão com o banco.');
      warned = true;
    } finally { busy = false; }
  }
  return { tick, start() { if (!timer) { timer = setInterval(() => void tick(), 5_000); timer.unref(); void tick(); } }, stop() { clearInterval(timer); timer = undefined; } };
}

export function createPersistentInventory({ repository = createSnapshotRepository(), client = createInventoryClient(), env = process.env } = {}) {
  const enabled = () => env.KARTADO_INVENTORY_SNAPSHOTS !== 'false' && Boolean(env.AGENTE_AUDITOR_BASE_URL && env.MONITORAMENTO_API_KEY);
  const worker = createSnapshotWorker({ repository, client, enabled });
  let warned = false;
  return {
    ...worker,
    async request(kind, query, assetUuid) {
      const target = snapshotTarget(kind, query);
      if (!target || !enabled()) return client.request(kind, query, assetUuid);
      let row;
      try {
        await repository.register(target);
        // Uma unidade consultada fica preparada também para o cruzamento padrão.
        if (kind === 'resumo') {
          for (const dimension of ['classe', 'rodovia']) await repository.register(snapshotTarget('cruzamento', { concessao: target.params.concessao, dimensao: dimension }));
        }
        if (query.refresh === '1') await repository.refresh(target.params.concessao);
        row = await repository.get(target.key);
      } catch {
        if (!warned) console.error('[Inventário] Persistência indisponível; usando consulta direta. Execute a migração do inventário.');
        warned = true;
        return client.request(kind, query, assetUuid);
      }
      if (!row) return client.request(kind, query, assetUuid);
      void worker.tick();
      return snapshotResponse(row);
    },
  };
}

export const persistentInventory = createPersistentInventory();
