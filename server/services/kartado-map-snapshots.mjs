import { randomUUID } from 'node:crypto';
import { query } from '../db.mjs';
import { getToken, listCompanies } from './kartado.service.mjs';
import { ReportingDetailError } from './kartado-reporting-detail.service.mjs';
import { createReportingMapClient } from './kartado-reporting-map.service.mjs';

// Base do mapa de apontamentos. O Kartado leva de 3 a 5 s por página, o que torna
// inviável carregar o histórico completo a cada abertura do mapa (a maior unidade
// passa de 200 mil apontamentos). Esta base guarda uma cópia, só com os campos do
// mapa, recoletada inteira todo dia às 04:00 de Brasília ou pelo botão do mapa.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
// O cliente do Kartado aceita 5 chamadas simultâneas no total; a coleta usa 2 para
// não disputar com as telas abertas.
const CONCURRENCY = 2;
const LEASE_SECONDS = 300;
const RETRY_AFTER_FAILURE_SECONDS = 3600;
const MANUAL_COOLDOWN_SECONDS = 300;
const COMPANIES_EVERY_MS = 6 * 3600_000;
// Cada etapa coleta até 20 páginas e devolve a vez: uma unidade grande não segura a fila,
// e a unidade que alguém está olhando passa à frente na etapa seguinte.
export const SLICE_PAGES = 20;
export const MAX_POINTS = 3000;
const LIST_PAGE_SIZE = 20;

/** Próxima execução diária às `hour` horas de Brasília (UTC-3, sem horário de verão desde 2019). */
export function nextDailyRun(now = new Date(), hour = 4, offsetHours = -3) {
  const local = new Date(now.getTime() + offsetHours * 3600_000);
  let run = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - offsetHours * 3600_000;
  if (run <= now.getTime()) run += 86_400_000;
  return new Date(run);
}

/** Mesmo agrupamento de status usado nas cores e no calor de pendências do mapa. */
export function statusGroup(status) {
  const key = String(status || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (['executado', 'concluido', 'encerrado', 'finalizado'].includes(key)) return 'completed';
  if (['em execucao', 'em andamento'].includes(key)) return 'progress';
  if (['aberto', 'identificado', 'pendente', 'programado'].includes(key)) return 'pending';
  return 'other';
}

function toRow(item) {
  const km = item.km === null || item.km === undefined || item.km === '' ? null : Number(item.km);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(item.encontradoEm || '') ? item.encontradoEm : null;
  return {
    uuid: item.uuid,
    numero: item.numero === null || item.numero === undefined ? null : String(item.numero),
    rodovia: item.rodovia || null,
    km: Number.isFinite(km) ? km : null,
    foundAt: date,
    classe: item.classe,
    status: item.status,
    group: statusGroup(item.status),
    lon: item.coordinates ? item.coordinates[0] : null,
    lat: item.coordinates ? item.coordinates[1] : null,
  };
}

// ── Parâmetros das consultas do mapa ─────────────────────────────────────────
function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function text(value, name) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 300) throw new ReportingDetailError(`Filtro inválido: ${name}.`, 400);
  return value;
}
export function mapFilters(input) {
  const { company } = input;
  if (typeof company !== 'string' || !UUID.test(company)) throw new ReportingDetailError('Unidade inválida.', 400);
  const from = input.from ?? '';
  const to = input.to ?? '';
  if (from || to) {
    if (!validDate(from) || !validDate(to) || from > to)
      throw new ReportingDetailError('Informe um período válido, com início anterior ao fim.', 400);
  }
  return {
    company: company.toLowerCase(),
    from,
    to,
    status: text(input.status, 'status'),
    classe: text(input.classe, 'classe'),
    rodovia: text(input.rodovia, 'rodovia'),
  };
}
export function mapBounds(value) {
  const parts = typeof value === 'string' ? value.split(',').map(Number) : [];
  const [west, south, east, north] = parts;
  if (
    parts.length !== 4 ||
    !parts.every(Number.isFinite) ||
    west > east ||
    south > north ||
    Math.abs(south) > 90 ||
    Math.abs(north) > 90
  )
    throw new ReportingDetailError('Área do mapa inválida.', 400);
  return { west, south, east, north };
}
function where(filters, values) {
  values.push(filters.company);
  const clauses = [`company_uuid=$${values.length}`];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.from) add('found_at>=?', filters.from);
  if (filters.to) add('found_at<=?', filters.to);
  if (filters.status) add('status=?', filters.status);
  if (filters.classe) add('classe=?', filters.classe);
  if (filters.rodovia) add('rodovia=?', filters.rodovia);
  return clauses.join(' and ');
}
const POINT_COLUMNS = `uuid, numero, rodovia, km, to_char(found_at,'YYYY-MM-DD') as "encontradoEm", classe, status, lon, lat`;
function pointOut(row) {
  return {
    uuid: row.uuid,
    numero: row.numero,
    rodovia: row.rodovia,
    km: row.km,
    encontradoEm: row.encontradoEm,
    classe: row.classe,
    status: row.status,
    coordinates: row.lon === null || row.lat === null ? null : [row.lon, row.lat],
  };
}

// ── Repositório ──────────────────────────────────────────────────────────────
export function createMapRepository({ execute = query } = {}) {
  return {
    async registerCompanies(companies) {
      if (!companies.length) return;
      await execute(
        `insert into kartado_map_sync (company_uuid, company_name)
        select * from unnest($1::uuid[], $2::text[])
        on conflict (company_uuid) do update set company_name=excluded.company_name`,
        [companies.map((item) => item.uuid), companies.map((item) => item.name)],
      );
    },
    async ensure(company) {
      await execute('insert into kartado_map_sync (company_uuid) values ($1) on conflict do nothing', [company]);
    },
    async sync(company) {
      return (await execute('select * from kartado_map_sync where company_uuid=$1', [company])).rows[0] || null;
    },
    /** Antecipa a coleta da unidade; ignora se já está coletando ou se foi pedida há menos de 5 minutos. */
    async requestRefresh(company) {
      const result = await execute(
        `update kartado_map_sync set next_run_at=now(), manual_requested_at=now(), requested_at=now()
        where company_uuid=$1 and (lease_until is null or lease_until<now())
        and (manual_requested_at is null or manual_requested_at<now()-($2::integer * interval '1 second'))
        returning company_uuid`,
        [company, MANUAL_COOLDOWN_SECONDS],
      );
      return result.rowCount > 0;
    },
    /** Põe à frente da fila a unidade ainda sem base que alguém abriu no mapa. */
    async prioritize(company) {
      await execute(
        `update kartado_map_sync set requested_at=coalesce(requested_at, now())
        where company_uuid=$1 and last_success_at is null`,
        [company],
      );
    },
    /**
     * Reserva a próxima etapa: primeiro as unidades pedidas (abertas no mapa ou "Atualizar
     * mapa"), depois a fila pelo horário. Uma coleta pausada continua de onde parou, na
     * mesma geração; uma nova começa outra geração.
     */
    async claim() {
      // O token da lease impede uma coleta atrasada de sobrescrever outra instância.
      const result = await execute(
        `update kartado_map_sync set lease_until=now()+($2::integer * interval '1 second'), lease_token=$1,
        generation=case when state='em_andamento' and pages_total>0 then generation else generation+1 end,
        run_started_at=case when state='em_andamento' and pages_total>0 then run_started_at else now() end,
        pages_done=case when state='em_andamento' and pages_total>0 then pages_done else 0 end,
        pages_failed=case when state='em_andamento' and pages_total>0 then pages_failed else 0 end,
        pages_total=case when state='em_andamento' and pages_total>0 then pages_total else 0 end,
        state='em_andamento'
        where company_uuid=(select company_uuid from kartado_map_sync
          where (next_run_at<=now() or (state='em_andamento' and pages_total>0))
          and (lease_until is null or lease_until<now())
          order by requested_at asc nulls last, next_run_at for update skip locked limit 1)
        returning *`,
        [randomUUID(), LEASE_SECONDS],
      );
      return result.rows[0] || null;
    },
    /** Encerra a etapa sem concluir a coleta, liberando a vez para a próxima da fila. */
    async pause(run) {
      await execute(
        'update kartado_map_sync set lease_until=null, lease_token=null where company_uuid=$1 and lease_token=$2',
        [run.company_uuid, run.lease_token],
      );
    },
    /** Renova a lease e registra o progresso; false quando outra instância assumiu. */
    async progress(run, done, total, failed = 0) {
      const result = await execute(
        `update kartado_map_sync set lease_until=now()+($4::integer * interval '1 second'), pages_done=$2,
        pages_total=$3, pages_failed=$6
        where company_uuid=$1 and lease_token=$5`,
        [run.company_uuid, done, total, LEASE_SECONDS, run.lease_token, failed],
      );
      return result.rowCount > 0;
    },
    async save(run, items) {
      const rows = items.map(toRow);
      if (!rows.length) return;
      const column = (key) => rows.map((row) => row[key]);
      await execute(
        `insert into kartado_map_points
          (company_uuid, uuid, generation, numero, rodovia, km, found_at, classe, status, status_group, lon, lat)
        select $1::uuid, u, $2::integer, n, r, k, f, c, s, g, x, y
        from unnest($3::uuid[], $4::text[], $5::text[], $6::float8[], $7::date[], $8::text[], $9::text[], $10::text[],
          $11::float8[], $12::float8[]) as t(u, n, r, k, f, c, s, g, x, y)
        on conflict (company_uuid, uuid) do update set generation=excluded.generation, numero=excluded.numero,
          rodovia=excluded.rodovia, km=excluded.km, found_at=excluded.found_at, classe=excluded.classe,
          status=excluded.status, status_group=excluded.status_group, lon=excluded.lon, lat=excluded.lat`,
        [
          run.company_uuid,
          run.generation,
          column('uuid'),
          column('numero'),
          column('rodovia'),
          column('km'),
          column('foundAt'),
          column('classe'),
          column('status'),
          column('group'),
          column('lon'),
          column('lat'),
        ],
      );
    },
    /**
     * Encerra a coleta. Completa: remove os apontamentos que não vieram nesta coleta
     * (excluídos na origem) e agenda a próxima para as 04:00. Incompleta: preserva a
     * base anterior e tenta de novo em uma hora.
     */
    async finish(run, { complete, error = null, now = new Date() }) {
      if (complete)
        await execute('delete from kartado_map_points where company_uuid=$1 and generation<>$2', [
          run.company_uuid,
          run.generation,
        ]);
      const retry = new Date(now.getTime() + RETRY_AFTER_FAILURE_SECONDS * 1000);
      const daily = nextDailyRun(now);
      await execute(
        `update kartado_map_sync set lease_until=null, lease_token=null, requested_at=null,
        state=$3, last_error=$4,
        last_success_at=case when $2::boolean then now() else last_success_at end,
        records_total=(select count(*) from kartado_map_points where company_uuid=$1),
        next_run_at=$5
        where company_uuid=$1 and lease_token=$6`,
        [
          run.company_uuid,
          complete,
          complete ? 'ociosa' : run.pages_done_ok ? 'incompleta' : 'falhou',
          error,
          complete || daily < retry ? daily : retry,
          run.lease_token,
        ],
      );
    },
    async summary(filters) {
      const values = [];
      const clause = where(filters, values);
      const [counts, cells, options] = await Promise.all([
        execute(
          `select count(*)::integer as total, count(lat)::integer as mapped from kartado_map_points where ${clause}`,
          values,
        ),
        // Células de ~11 m (4 casas decimais): o calor fica igual ao dos pontos individuais
        // e o volume enviado ao navegador cai para uma fração.
        execute(
          `select round(lat::numeric,4)::float8 as lat, round(lon::numeric,4)::float8 as lon, count(*)::integer as total,
          count(*) filter (where status_group in ('pending','progress'))::integer as pending
          from kartado_map_points where ${clause} and lat is not null group by 1, 2`,
          values,
        ),
        execute(
          `select 'status' as kind, status as value from kartado_map_points where company_uuid=$1 group by status
          union all select 'classe', classe from kartado_map_points where company_uuid=$1 group by classe
          union all select 'rodovia', rodovia from kartado_map_points where company_uuid=$1 and rodovia is not null group by rodovia`,
          [filters.company],
        ),
      ]);
      const pick = (kind) =>
        options.rows
          .filter((row) => row.kind === kind)
          .map((row) => row.value)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return {
        total: counts.rows[0].total,
        mapped: counts.rows[0].mapped,
        cells: cells.rows.map((row) => [row.lat, row.lon, row.total, row.pending]),
        options: { status: pick('status'), classes: pick('classe'), rodovias: pick('rodovia') },
      };
    },
    /**
     * Pontos individuais numa área; vazio (só o total) quando passam de `limit`.
     * Com `center`, devolve sempre os `limit` mais próximos dele (clique numa área do calor).
     */
    async points(filters, bounds, { limit = MAX_POINTS, pendingOnly = false, center = null } = {}) {
      const values = [];
      let clause = where(filters, values);
      values.push(bounds.south, bounds.north, bounds.west, bounds.east);
      const n = values.length;
      clause += ` and lat between $${n - 3} and $${n - 2} and lon between $${n - 1} and $${n}`;
      if (pendingOnly) clause += ` and status_group in ('pending','progress')`;
      const total = (await execute(`select count(*)::integer as total from kartado_map_points where ${clause}`, values))
        .rows[0].total;
      if (total > limit && !center) return { total, items: [] };
      let order = 'found_at desc nulls last, numero';
      if (center) {
        values.push(center.lat, center.lon);
        order = `(lat-$${values.length - 1})^2 + (lon-$${values.length})^2`;
      }
      values.push(limit);
      const rows = await execute(
        `select ${POINT_COLUMNS} from kartado_map_points where ${clause} order by ${order} limit $${values.length}`,
        values,
      );
      return { total, items: rows.rows.map(pointOut) };
    },
    async list(filters, page) {
      const values = [];
      const clause = where(filters, values);
      const total = (await execute(`select count(*)::integer as total from kartado_map_points where ${clause}`, values))
        .rows[0].total;
      values.push(LIST_PAGE_SIZE, (page - 1) * LIST_PAGE_SIZE);
      const rows = await execute(
        `select ${POINT_COLUMNS} from kartado_map_points where ${clause}
        order by found_at desc nulls last, numero limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return { total, pages: Math.max(1, Math.ceil(total / LIST_PAGE_SIZE)), items: rows.rows.map(pointOut) };
    },
  };
}

// ── Coleta ───────────────────────────────────────────────────────────────────
/**
 * Coleta até `maxPages` páginas, continuando de `run.pages_done`. Devolve o ponto em que
 * parou; `finished` indica que todas as páginas foram percorridas.
 */
export async function collectCompany({
  run,
  repository,
  client,
  maxPages = Infinity,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const fetchPage = async (page) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.page(
          { company: run.company_uuid, from: '', to: '', period: 'all', page: String(page) },
          { pageSize: PAGE_SIZE, maxPage: Number.MAX_SAFE_INTEGER },
        );
      } catch (error) {
        if (attempt >= 2) throw error;
        await wait(2000 * 2 ** attempt);
      }
    }
  };
  let done = run.pages_done || 0,
    pages = run.pages_total || 0,
    failed = run.pages_failed || 0,
    received = 0;
  const limit = done + maxPages;
  if (!pages) {
    const first = await fetchPage(1);
    pages = first.paginas;
    await repository.save(run, first.items);
    received += first.items.length;
    done = 1;
    if (!(await repository.progress(run, done, pages, failed))) return { lost: true };
  }
  while (done < pages && done < limit) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, pages - done, limit - done) },
      (_, index) => done + 1 + index,
    );
    const results = await Promise.allSettled(batch.map(fetchPage));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        await repository.save(run, result.value.items);
        received += result.value.items.length;
      } else failed++;
    }
    done += batch.length;
    if (!(await repository.progress(run, done, pages, failed))) return { lost: true };
  }
  return { failed, received, done, pages, finished: done >= pages };
}

export function createMapWorker({
  repository = createMapRepository(),
  client = createReportingMapClient(),
  companies = async () => {
    const { token } = await getToken(process.env.KARTADO_USERNAME, process.env.KARTADO_PASSWORD);
    return listCompanies(token);
  },
  enabled = () =>
    process.env.KARTADO_MAP_SNAPSHOTS !== 'false' &&
    Boolean(process.env.KARTADO_USERNAME && process.env.KARTADO_PASSWORD),
  log = console.error,
  now = () => Date.now(),
} = {}) {
  let timer,
    busy = false,
    warned = false,
    companiesAt = 0;
  async function tick() {
    if (busy || !enabled()) return false;
    busy = true;
    try {
      if (now() - companiesAt > COMPANIES_EVERY_MS) {
        try {
          await repository.registerCompanies((await companies()).map(({ uuid, name }) => ({ uuid, name })));
          companiesAt = now();
        } catch (error) {
          if (error?.code || error?.routine) throw error; // erro de banco: tratado abaixo
          companiesAt = now() - COMPANIES_EVERY_MS + 600_000; // Kartado indisponível: tenta em 10 min
        }
      }
      const run = await repository.claim();
      warned = false;
      if (!run) return false;
      const name = run.company_name || run.company_uuid;
      let result;
      try {
        result = await collectCompany({ run, repository, client, maxPages: SLICE_PAGES });
      } catch {
        await repository.finish(
          { ...run, pages_done_ok: run.pages_done > run.pages_failed },
          { complete: false, error: 'Não foi possível consultar o Kartado. A base anterior foi preservada.' },
        );
        return true;
      }
      if (result.lost) return true;
      if (!result.finished) {
        await repository.pause(run);
        return true;
      }
      const complete = result.failed === 0;
      await repository.finish(
        { ...run, pages_done_ok: result.done > result.failed },
        {
          complete,
          error: complete
            ? null
            : `${result.failed} página(s) não puderam ser coletadas. A base anterior foi preservada; nova tentativa em 1 hora.`,
        },
      );
      const records = (await repository.sync(run.company_uuid))?.records_total ?? 0;
      const seconds = Math.round((now() - new Date(run.run_started_at).getTime()) / 1000);
      log(
        `[Mapa] ${name}: ${records} apontamentos na base, coleta em ${seconds} s${complete ? '' : ` (${result.failed} página(s) com falha)`}.`,
      );
      return true;
    } catch {
      if (!warned)
        log('[Mapa] Base do mapa indisponível. Execute a migração (db:migrate-kartado-map) e verifique o banco.');
      warned = true;
      return false;
    } finally {
      busy = false;
    }
  }
  return {
    tick,
    start() {
      if (!timer) {
        // Enquanto houver etapas na fila, emenda uma na outra; sem trabalho, confere a cada 30 s.
        const loop = async () => {
          if (await tick()) setTimeout(() => void loop(), 0).unref();
        };
        timer = setInterval(() => void loop(), 30_000);
        timer.unref();
        void loop();
      }
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}

/** Estado da coleta, no formato enviado ao navegador. */
export function syncOut(row) {
  if (!row) return { estado: 'aguardando', atualizadoEm: null, proximaEm: null, paginas: 0, paginasTotal: 0 };
  const running = row.state === 'em_andamento' || (row.lease_until && new Date(row.lease_until).getTime() > Date.now());
  return {
    estado: running
      ? 'em_andamento'
      : row.last_success_at
        ? row.state
        : row.state === 'ociosa'
          ? 'aguardando'
          : row.state,
    atualizadoEm: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
    proximaEm: new Date(row.next_run_at).toISOString(),
    paginas: running ? row.pages_done : 0,
    paginasTotal: running ? row.pages_total : 0,
    erro: row.last_error || null,
  };
}

export const mapWorker = createMapWorker();
