import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  bearer,
  crearCondominio,
  crearEntorno,
  crearUsuario,
  eventos,
  iniciarSesion,
  type Entorno,
} from './helpers/entorno';

let e: Entorno;
let A: string;
let B: string;
const app = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
});
afterAll(async () => {
  await app.$disconnect();
  await e.cerrar();
});

const serializar = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x));

describe('Requisito: eventos auditados', () => {
  it('login fallido con IP y sin contraseña; login exitoso; logout', async () => {
    const u = await crearUsuario(e, 'aud1');
    await e.http
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'contraseña-equivocada' });
    const s = await iniciarSesion(e, u);
    await e.http.post('/api/v1/auth/logout').set(bearer(s.token));
    const ev = await eventos(e, { actorId: u.id });
    expect(ev.map((x) => x.accion)).toEqual([
      'auth.login_fallido',
      'auth.login_exitoso',
      'auth.logout',
    ]);
    expect(ev[0]!.ip).toBeTruthy();
    expect(serializar(ev)).not.toContain('contraseña-equivocada');
    expect(serializar(ev)).not.toContain(PASSWORD);
  });

  it('revocar una concesión registra antes y después', async () => {
    const admin = await crearUsuario(e, 'aud-admin', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    });
    const asis = await crearUsuario(e, 'aud-asis', {
      roles: [{ condominioId: A, rol: 'ASISTENTE' }],
    });
    const s = await iniciarSesion(e, admin);
    const p = await e.http
      .post(`/api/v1/membresias/${asis.membresias[0]!.id}/permisos`)
      .set(bearer(s.token))
      .set('x-condominio-id', A)
      .send({ area: '03', accion: 'exportar', efecto: 'CONCEDER' });
    await e.http
      .post(`/api/v1/membresias/permisos/${p.body.id}/revocar`)
      .set(bearer(s.token))
      .set('x-condominio-id', A);
    const [ev] = await eventos(e, { accion: 'permiso.revocado', condominioId: A });
    expect(ev?.antes).toMatchObject({ area: '03', accion: 'exportar', revocadoEn: null });
    expect(ev?.despues).toMatchObject({ revocadoEn: expect.any(String) });
    expect(ev?.actorId).toBe(admin.id);
  });

  it('cambio y auditoría son atómicos: si la auditoría falla, el cambio no se aplica', async () => {
    const admin = await crearUsuario(e, 'aud-atom', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    });
    const asis = await crearUsuario(e, 'aud-atom2', {
      roles: [{ condominioId: A, rol: 'ASISTENTE' }],
    });
    const s = await iniciarSesion(e, admin);
    await e.owner.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION prueba_fallar_auditoria() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN IF NEW.accion = 'membresia.desactivada' THEN RAISE EXCEPTION 'fallo simulado'; END IF; RETURN NEW; END $$`);
    await e.owner.$executeRawUnsafe(
      'CREATE TRIGGER prueba_fallar_auditoria BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION prueba_fallar_auditoria()',
    );
    try {
      const r = await e.http
        .patch(`/api/v1/membresias/${asis.membresias[0]!.id}`)
        .set(bearer(s.token))
        .set('x-condominio-id', A)
        .send({ activo: false });
      expect(r.status).toBe(500);
      const m = await e.owner.membresia.findUniqueOrThrow({
        where: { id: asis.membresias[0]!.id },
      });
      expect(m.activo).toBe(true);
    } finally {
      await e.owner.$executeRawUnsafe('DROP TRIGGER prueba_fallar_auditoria ON auditoria');
      await e.owner.$executeRawUnsafe('DROP FUNCTION prueba_fallar_auditoria()');
    }
  });
});

describe('Requisito: inalterabilidad', () => {
  it('el rol de aplicación no puede actualizar ni borrar la bitácora', async () => {
    await expect(app.$executeRaw`UPDATE auditoria SET accion = 'x'`).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRaw`DELETE FROM auditoria`).rejects.toThrow(/permission denied/);
  });
});

describe('Requisito: aislamiento de la bitácora', () => {
  it('desde el contexto de B no se ven eventos de A ni eventos sin condominio', async () => {
    await e.owner.auditoria.create({
      data: { condominioId: A, accion: 'prueba.evento_a', objetoTipo: 'x' },
    });
    const u = await crearUsuario(e, 'aud-sin-condo');
    await e.http.post('/api/v1/auth/login').send({ email: u.email, password: 'mala-clave-123456' });

    const vistos = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.condominio_id', ${B}, true)`;
      return tx.auditoria.findMany({ where: { OR: [{ condominioId: A }, { actorId: u.id }] } });
    });
    expect(vistos).toHaveLength(0);
  });
});
