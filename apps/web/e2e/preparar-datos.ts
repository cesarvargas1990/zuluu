import pg from 'pg';

/**
 * Deja los usuarios demo (datos ficticios del seed) en un estado conocido antes de cada corrida:
 * sin MFA, sin bloqueos, membresías activas, sin excepciones de permisos y sin personas creadas por E2E.
 */
export default async function prepararDatos() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL: ejecute con `pnpm test:e2e` (carga ../../.env).');
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(
      `DELETE FROM codigo_respaldo WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE '%@demo.test')`,
    );
    await db.query(`UPDATE usuario SET mfa_secreto_cifrado = NULL, mfa_activado_en = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL
                    WHERE email LIKE '%@demo.test' OR email = 'superadmin@zulu.test'`);
    await db.query(
      `DELETE FROM codigo_respaldo WHERE usuario_id IN (SELECT id FROM usuario WHERE email = 'superadmin@zulu.test')`,
    );
    await db.query(
      `UPDATE membresia SET activo = true WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE '%@demo.test' AND email NOT LIKE 'e2e-%')`,
    );
    await db.query(
      `UPDATE membresia SET activo = false WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE 'e2e-%')`,
    );
    await db.query(`UPDATE permiso SET revocado_en = now() WHERE revocado_en IS NULL
                    AND membresia_id IN (SELECT m.id FROM membresia m JOIN usuario u ON u.id = m.usuario_id WHERE u.email LIKE '%@demo.test')`);
  } finally {
    await db.end();
  }
}
