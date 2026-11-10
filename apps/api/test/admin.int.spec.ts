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
let sa: { id: string; token: string };
let adminA: { token: string };

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  const u = await crearUsuario(e, 'superadmin', { superadmin: true, mfa: true });
  sa = { id: u.id, ...(await iniciarSesion(e, u)) };
  adminA = await iniciarSesion(
    e,
    await crearUsuario(e, 'admina', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    }),
  );
});
afterAll(() => e.cerrar());

const correo = (alias: string) => `${alias}.${e.sufijo}@prueba.test`;

describe('Requisito: acceso exclusivo del superadministrador', () => {
  it('una ADMINISTRADORA recibe 403 en /admin/*', async () => {
    for (const ruta of ['/api/v1/admin/usuarios', '/api/v1/admin/condominios']) {
      expect((await e.http.get(ruta).set(bearer(adminA.token))).status).toBe(403);
    }
    const r = await e.http
      .post('/api/v1/admin/usuarios')
      .set(bearer(adminA.token))
      .send({ nombre: 'X', email: correo('x') });
    expect(r.status).toBe(403);
  });

  it('las funciones entre condominios no se pueden llamar sin la marca de superadmin', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const app = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    await expect(app.$queryRaw`SELECT * FROM app_condominios()`).rejects.toThrow(
      /superadministrador/,
    );
    await app.$disconnect();
  });
});

describe('Requisito: condominios', () => {
  it('lista todos y crea uno nuevo; NIT repetido ⇒ 409', async () => {
    const nit = `NIT-${e.sufijo}`;
    const r = await e.http
      .post('/api/v1/admin/condominios')
      .set(bearer(sa.token))
      .send({ razonSocial: `Majagua ${e.sufijo}`, nit });
    expect(r.status).toBe(201);
    e.condominios.push(r.body.id);
    const lista = await e.http.get('/api/v1/admin/condominios').set(bearer(sa.token));
    expect(lista.body.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining([A, r.body.id]),
    );
    const dup = await e.http
      .post('/api/v1/admin/condominios')
      .set(bearer(sa.token))
      .send({ razonSocial: 'Otro', nit });
    expect(dup.status).toBe(409);
    expect(await eventos(e, { accion: 'condominio.creado', condominioId: r.body.id })).toHaveLength(
      1,
    );
  });
});

describe('Requisito: crear usuario con invitación', () => {
  it('crea el usuario sin contraseña, asigna el rol y envía la invitación con los pasos', async () => {
    const email = correo('nora');
    const r = await e.http
      .post('/api/v1/admin/usuarios')
      .set(bearer(sa.token))
      .send({ nombre: 'Nora Nueva', email, roles: [{ condominioId: A, rol: 'CONTADORA' }] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      correoEnviado: true,
      usuario: { email, nombre: 'Nora Nueva', invitacionPendiente: true },
    });

    const u = await e.owner.usuario.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash).toBeNull();
    const m = await e.owner.membresia.findMany({ where: { usuarioId: u.id } });
    expect(m).toEqual([
      expect.objectContaining({ condominioId: A, rol: 'CONTADORA', activo: true }),
    ]);

    const enviado = e.mailer.enviados.at(-1)!;
    expect(enviado.para).toBe(email);
    expect(enviado.asunto).toMatch(/Bienvenido/);
    expect(enviado.texto).toMatch(/verificación en dos pasos/);
    expect(enviado.html).toContain('/restablecer?token=');

    const token = e.mailer.tokenDe(email)!;
    const t = await e.owner.tokenRecuperacion.findFirstOrThrow({ where: { usuarioId: u.id } });
    expect(t.expiraEn.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(
      (await e.http.post('/api/v1/auth/restablecer').send({ token, password: PASSWORD })).status,
    ).toBe(204);
    expect(
      (await e.http.post('/api/v1/auth/login').send({ email, password: PASSWORD })).body
        .mfaRequerido,
    ).toBe(true);
    expect(await eventos(e, { accion: 'usuario.creado', objetoId: u.id })).toHaveLength(1);
  });

  it('email ya registrado ⇒ 409', async () => {
    const r = await e.http
      .post('/api/v1/admin/usuarios')
      .set(bearer(sa.token))
      .send({ nombre: 'Otra', email: correo('nora') });
    expect(r.status).toBe(409);
  });

  it('si el correo falla, el usuario se crea igual con correoEnviado=false', async () => {
    e.mailer.fallar = true;
    try {
      const r = await e.http
        .post('/api/v1/admin/usuarios')
        .set(bearer(sa.token))
        .send({ nombre: 'Sin Correo', email: correo('sincorreo') });
      expect(r.status).toBe(201);
      expect(r.body.correoEnviado).toBe(false);
    } finally {
      e.mailer.fallar = false;
    }
  });

  it('valida los datos (email inválido ⇒ 400 con error por campo)', async () => {
    const r = await e.http
      .post('/api/v1/admin/usuarios')
      .set(bearer(sa.token))
      .send({ nombre: 'X', email: 'malo' });
    expect(r.status).toBe(400);
    expect(r.body.errores).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'email' })]),
    );
  });
});

describe('Requisito: gestión de roles', () => {
  it('asigna, cambia, desactiva y reactiva un rol con auditoría', async () => {
    const u = await crearUsuario(e, 'roles');
    const asignar = await e.http
      .post(`/api/v1/admin/usuarios/${u.id}/roles`)
      .set(bearer(sa.token))
      .send({ condominioId: A, rol: 'ASISTENTE' });
    expect(asignar.status).toBe(201);
    const membresiaId: string = asignar.body.id;

    const lista = await e.http.get('/api/v1/admin/usuarios').set(bearer(sa.token));
    const fila = lista.body.find((x: { id: string }) => x.id === u.id);
    expect(fila.roles).toEqual([
      expect.objectContaining({ membresiaId, condominioId: A, rol: 'ASISTENTE', activo: true }),
    ]);

    const cambio = await e.http
      .patch(`/api/v1/admin/membresias/${membresiaId}`)
      .set(bearer(sa.token))
      .send({ condominioId: A, rol: 'OPERACIONES' });
    expect(cambio.status).toBe(200);
    expect(cambio.body.rol).toBe('OPERACIONES');

    const off = await e.http
      .patch(`/api/v1/admin/membresias/${membresiaId}`)
      .set(bearer(sa.token))
      .send({ condominioId: A, activo: false });
    expect(off.body.activo).toBe(false);
    const [ev] = await eventos(e, { accion: 'membresia.desactivada', objetoId: membresiaId });
    expect(ev?.antes).toMatchObject({ activo: true });
    expect(ev?.actorId).toBe(sa.id);
  });

  it('membresía de otro condominio indicado ⇒ 404', async () => {
    const B = await crearCondominio(e, 'B');
    const u = await crearUsuario(e, 'otro', { roles: [{ condominioId: A, rol: 'ASISTENTE' }] });
    const r = await e.http
      .patch(`/api/v1/admin/membresias/${u.membresias[0]!.id}`)
      .set(bearer(sa.token))
      .send({ condominioId: B, activo: false });
    expect(r.status).toBe(404);
  });
});

describe('Requisito: estado del usuario', () => {
  it('desactivar cierra sus sesiones; reactivar permite volver a entrar', async () => {
    const u = await crearUsuario(e, 'estado', { roles: [{ condominioId: A, rol: 'ASISTENTE' }] });
    const s = await iniciarSesion(e, u);
    const off = await e.http
      .patch(`/api/v1/admin/usuarios/${u.id}`)
      .set(bearer(sa.token))
      .send({ activo: false });
    expect(off.status).toBe(200);
    expect((await e.http.get('/api/v1/auth/yo').set(bearer(s.token))).status).toBe(401);
    await e.http
      .patch(`/api/v1/admin/usuarios/${u.id}`)
      .set(bearer(sa.token))
      .send({ activo: true });
    expect(
      (await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD })).status,
    ).toBe(200);
  });

  it('no puede desactivarse a sí mismo', async () => {
    const r = await e.http
      .patch(`/api/v1/admin/usuarios/${sa.id}`)
      .set(bearer(sa.token))
      .send({ activo: false });
    expect(r.status).toBe(400);
  });

  it('reenvía la invitación', async () => {
    const u = await crearUsuario(e, 'reenvio');
    const antes = e.mailer.enviados.length;
    const r = await e.http.post(`/api/v1/admin/usuarios/${u.id}/invitacion`).set(bearer(sa.token));
    expect(r.status).toBe(200);
    expect(r.body.correoEnviado).toBe(true);
    expect(e.mailer.enviados.length).toBe(antes + 1);
  });
});
