import bcrypt from 'bcryptjs';
import { createPool } from '../server/db.mjs';

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD ?? '';
const fullName = process.env.INITIAL_ADMIN_NAME?.trim() || null;

if (!email || password.length < 12) {
  throw new Error('Configure INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD (mínimo de 12 caracteres).');
}

const pool = createPool({ migration: true });

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `insert into app_users (email, full_name, password_hash, role)
     values ($1, $2, $3, 'admin')
     on conflict (email) do update
       set full_name = excluded.full_name,
           password_hash = excluded.password_hash,
           role = 'admin',
           is_active = true,
           updated_at = now()`,
    [email, fullName, passwordHash],
  );
  console.log(`Administrador configurado: ${email}`);
} finally {
  await pool.end();
}
