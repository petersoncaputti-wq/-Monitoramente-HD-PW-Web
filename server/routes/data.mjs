import { Router } from 'express';
import { requireUser } from '../auth.mjs';
import { query } from '../db.mjs';

const router = Router();
router.use(requireUser);

router.get('/storage', async (_request, response) => {
  const result = await query(
    `select to_char(reading_date, 'YYYY-MM-DD') as reading_date,
            to_char(reading_time, 'HH24:MI:SS') as reading_time,
            computer, unit,
            total_gb::double precision as total_gb,
            used_gb::double precision as used_gb,
            free_gb::double precision as free_gb,
            percent_used::double precision as percent_used,
            percent_free::double precision as percent_free
       from storage_readings
      order by observed_at asc`,
  );
  response.json(result.rows);
});

router.get('/tickets', async (_request, response) => {
  const result = await query('select * from tickets order by opened_at desc');
  response.json(result.rows);
});

router.get('/pw-users/:sourceKind', async (request, response) => {
  const table = request.params.sourceKind === 'portal' ? 'pw_portal_users' : 'pw_explorer_users';
  const order = table === 'pw_portal_users' ? 'email asc nulls last' : 'nome asc nulls last';
  const result = await query(`select * from ${table} order by ${order}`);
  response.json(result.rows);
});

router.get('/e365', async (_request, response) => {
  const result = await query(
    `select ultimate_id, account_name, country_iso, product_id, product_name,
            connection_status, ims_id, persona_email, usage_date, usage_quarter,
            usage_interval, currency, gross_amount::double precision as gross_amount,
            net_amount::double precision as net_amount, exported_at
       from e365_usage
      order by usage_quarter asc, persona_email asc nulls last`,
  );
  response.json(result.rows);
});

export default router;
