import { createPool } from '../server/db.mjs';
import { isUuid } from '../server/services/saml.service.mjs';
const [email, objectId] = process.argv.slice(2);
const tenant = process.env.SAML_ENTRA_TENANT_ID?.trim();
if (!email || !isUuid(objectId) || !isUuid(tenant)) throw new Error('Uso: node scripts/link-saml-user.mjs <email-local> <object-id-Entra>. Configure SAML_ENTRA_TENANT_ID.');
const pool = createPool({ migration: true });
try {
  const users = await pool.query('select id from app_users where lower(email)=$1 and is_active=true', [email.trim().toLowerCase()]);
  if (users.rows.length !== 1) throw new Error('É necessário exatamente um usuário local ativo com esse e-mail.');
  await pool.query(`insert into app_saml_identities(tenant_id,object_id,user_id) values ($1,$2,$3) on conflict do nothing`, [tenant, objectId, users.rows[0].id]);
  const linked = await pool.query('select user_id from app_saml_identities where tenant_id=$1 and object_id=$2', [tenant, objectId]);
  if (linked.rows[0]?.user_id !== users.rows[0].id) throw new Error('Vínculo conflitante. Nenhuma identidade existente foi substituída.');
  console.log('Identidade Entra vinculada ao usuário local. Permissões locais preservadas.');
} finally { await pool.end(); }
