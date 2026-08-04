import { requireUser } from './_auth.mjs';
import { query } from './_database.mjs';

const CONFIG = {
  explorer: {
    columns: 'nome, email, pw_id, data_criacao, descricao, ultimo_acesso, status, status_acesso, status_projectwise, elegivel_exclusao, motivo, acao_executada, resultado',
    order: 'nome', table: 'pw_explorer_users',
  },
  portal: {
    columns: 'email, communication_email, first_name, middle_name, last_name, profile_country, language, entitlement_country, entitlement_groups, cost_allocation_group, user_management_groups, roles, global_fulfillment_contact, fulfillment_contact_countries, city, company_name, job_title, locked, profile_creation_date, last_login_date, mfa',
    order: 'email', table: 'pw_portal_users',
  },
};

export async function handlePwUsersRequest({ headers = {}, method, query: params = {} }) {
  if (method !== 'GET') return { error: 'Metodo nao permitido.', status: 405 };
  const auth = await requireUser(headers);
  if (auth.error) return auth;
  const config = CONFIG[params.kind];
  if (!config) return { error: 'Fonte invalida.', status: 400 };
  const limit = Math.min(Math.max(Number(params.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const result = await query(
    `select ${config.columns} from ${config.table} order by ${config.order} asc limit $1 offset $2`,
    [limit, offset],
  );
  return { body: result.rows, status: 200 };
}
