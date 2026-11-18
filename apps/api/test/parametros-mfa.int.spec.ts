/**
 * Parámetros generales · control de la verificación en dos pasos (2FA).
 * La regla global prima: apagada, nadie la necesita; encendida, se controla por usuario.
 */
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
let admin: { token: string };
let asistente: { id: string; email: string };
let contadora: { id: string; email: string };

const api = (token: string) => ({
  get: (p: string) => e.http.get(`/api/v1${p}`).set(bearer(token)),
  patch: (p: string, d: object) => e.http.patch(`/api/v1${p}`).set(bearer(token)).send(d),
});
const login = (email: string) =>
  e.http.post('/api/v1/auth/login').send({ email, password: PASSWORD });
/** Ruta de negocio de finanzas (rol con permiso 02): solo el 2FA puede bloquearla. */
const finanzas = (token: string) =>
  e.http.get('/api/v1/prueba/finanzas').set(bearer(token)).set('x-condominio-id', A);
const fijarGlobal = (activo: boolean) => api(sa.token).patch('/admin/parametros/mfa', { activo });
const fijarUsuario = (id: string, politica: string) =>
  api(sa.token).patch(`/admin/usuarios/${id}/mfa`, { politica });
const fila = async (id: string) =>
  (await api(sa.token).get('/admin/usuarios')).body.find((u: { id: string }) => u.id === id);

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  const u = await crearUsuario(e, 'param-sa', { superadmin: true, mfa: true });
  sa = { id: u.id, ...(await iniciarSesion(e, u)) };
  admin = await iniciarSesion(
    e,
    await crearUsuario(e, 'param-admin', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    }),
  );
  asistente = await crearUsuario(e, 'param-asistente', {
    roles: [{ condominioId: A, rol: 'ASISTENTE' }],
  });
  contadora = await crearUsuario(e, 'param-contadora', {
    roles: [{ condominioId: A, rol: 'CONTADORA' }],
  });
});
afterAll(async () => {
  await fijarGlobal(true); // el valor de fábrica debe quedar intacto para las demás pruebas
  await e.cerrar();
});

describe('Parámetros generales: acceso', () => {
  it('solo el superadministrador los consulta o cambia', async () => {
    expect((await api(admin.token).get('/admin/parametros')).status).toBe(403);
    expect((await api(admin.token).patch('/admin/parametros/mfa', { activo: false })).status).toBe(
      403,
    );
    expect(
      (
        await api(admin.token).patch(`/admin/usuarios/${asistente.id}/mfa`, {
          politica: 'OBLIGATORIO',
        })
      ).status,
    ).toBe(403);
    expect((await e.http.get('/api/v1/admin/parametros')).status).toBe(401);
  });

  it('de fábrica el control global está encendido', async () => {
    const r = await api(sa.token).get('/admin/parametros');
    expect(r.status).toBe(200);
    expect(r.body.mfa).toMatchObject({ global: true });
  });

  it('valida el cuerpo', async () => {
    expect((await api(sa.token).patch('/admin/parametros/mfa', { activo: 'si' })).status).toBe(400);
    expect((await api(sa.token).patch('/admin/parametros/mfa', {})).status).toBe(400);
    expect(
      (await api(sa.token).patch(`/admin/usuarios/${asistente.id}/mfa`, { politica: 'TAL_VEZ' }))
        .status,
    ).toBe(400);
    expect(
      (
        await api(sa.token).patch('/admin/usuarios/99999999-9999-4999-8999-999999999999/mfa', {
          politica: 'HEREDAR',
        })
      ).status,
    ).toBe(404);
  });
});

describe('Regla por usuario con el control global encendido', () => {
  it('sin ajuste individual se conserva la regla por rol', async () => {
    expect((await login(asistente.email)).body.mfaRequerido).toBe(false);
    expect((await login(contadora.email)).body.mfaRequerido).toBe(true);
  });

  it('"Obligatorio" exige 2FA a un rol que no lo exige y obliga a registrarlo', async () => {
    expect((await fijarUsuario(asistente.id, 'OBLIGATORIO')).status).toBe(200);
    const r = await login(asistente.email);
    expect(r.body).toMatchObject({ mfaRequerido: true, mfaConfigurado: false });
    const bloqueado = await finanzas(r.body.accessToken);
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.message).toBe('Debe completar la verificación en dos pasos.');
    expect(await fila(asistente.id)).toMatchObject({
      mfaPolitica: 'OBLIGATORIO',
      mfaRequerido: true,
      mfaMotivo: 'USUARIO_OBLIGATORIO',
    });
  });

  it('"No exigir" libera a un rol que sí lo exige', async () => {
    expect((await fijarUsuario(contadora.id, 'NO_REQUERIDO')).status).toBe(200);
    const r = await login(contadora.email);
    expect(r.body.mfaRequerido).toBe(false);
    const sesion = await e.http.get('/api/v1/auth/yo').set(bearer(r.body.accessToken));
    expect(sesion.body.mfa).toMatchObject({ requerido: false, verificado: false });
    expect(await fila(contadora.id)).toMatchObject({
      mfaPolitica: 'NO_REQUERIDO',
      mfaRequerido: false,
      mfaMotivo: 'USUARIO_EXENTO',
    });
  });

  it('volver a "Según su rol" restaura la regla de siempre', async () => {
    await fijarUsuario(asistente.id, 'HEREDAR');
    await fijarUsuario(contadora.id, 'HEREDAR');
    expect((await login(asistente.email)).body.mfaRequerido).toBe(false);
    expect((await login(contadora.email)).body.mfaRequerido).toBe(true);
  });
});

describe('La regla global prima', () => {
  it('apagado: nadie necesita 2FA aunque el usuario lo tenga obligatorio, y se puede ingresar sin él', async () => {
    await fijarUsuario(asistente.id, 'OBLIGATORIO');
    const apagar = await fijarGlobal(false);
    expect(apagar.status).toBe(200);
    expect(apagar.body).toMatchObject({ global: false });

    const a = await login(asistente.email);
    expect(a.body.mfaRequerido).toBe(false);
    const privilegiado = await login(contadora.email); // rol que normalmente lo exige
    expect(privilegiado.body.mfaRequerido).toBe(false);
    expect((await finanzas(privilegiado.body.accessToken)).status).toBe(200);
    expect((await finanzas(a.body.accessToken)).status).toBe(200);

    const f = await fila(asistente.id);
    expect(f).toMatchObject({
      mfaPolitica: 'OBLIGATORIO',
      mfaRequerido: false,
      mfaMotivo: 'GLOBAL_APAGADO',
    });
  });

  it('apagado: el ajuste individual se puede guardar pero no se aplica', async () => {
    expect((await fijarUsuario(contadora.id, 'OBLIGATORIO')).status).toBe(200);
    expect((await login(contadora.email)).body.mfaRequerido).toBe(false);
  });

  it('encendido de nuevo: vuelve a regir lo individual', async () => {
    await fijarUsuario(contadora.id, 'NO_REQUERIDO');
    expect((await fijarGlobal(true)).body).toMatchObject({ global: true });
    expect((await login(asistente.email)).body.mfaRequerido).toBe(true); // obligatorio individual
    expect((await login(contadora.email)).body.mfaRequerido).toBe(false); // exento individual
    await fijarUsuario(asistente.id, 'HEREDAR');
    await fijarUsuario(contadora.id, 'HEREDAR');
  });

  it('renovar la sesión aplica el cambio sin volver a iniciar sesión', async () => {
    const sesion = await login(asistente.email);
    const cookie = sesion.get('set-cookie')![0]!.split(';')[0]!;
    expect(sesion.body.mfaRequerido).toBe(false);
    await fijarUsuario(asistente.id, 'OBLIGATORIO');
    const renovada = await e.http.post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(renovada.status).toBe(200);
    const yo = await e.http.get('/api/v1/auth/yo').set(bearer(renovada.body.accessToken));
    expect(yo.body.mfa.requerido).toBe(true);
    await fijarUsuario(asistente.id, 'HEREDAR');
  });

  it('el superadministrador también queda sujeto a la regla global', async () => {
    await fijarGlobal(false);
    const r = await login(`param-sa.${e.sufijo}@prueba.test`);
    expect(r.body.mfaRequerido).toBe(false);
    // y puede volver a encenderla con la sesión que ya tenía
    expect((await fijarGlobal(true)).status).toBe(200);
  });
});

describe('Trazabilidad', () => {
  it('cada cambio queda auditado con valor anterior, nuevo y responsable', async () => {
    await fijarGlobal(true);
    await fijarGlobal(false);
    await fijarGlobal(true);
    const g = await eventos(e, { accion: 'parametros.mfa_global_cambiado', actorId: sa.id });
    const ultimo = g.at(-1)!;
    expect(ultimo.antes).toMatchObject({ global: false });
    expect(ultimo.despues).toMatchObject({ global: true });
    expect(g.length).toBeGreaterThanOrEqual(2);

    await fijarUsuario(asistente.id, 'OBLIGATORIO');
    const u = await eventos(e, { accion: 'usuario.mfa_politica_cambiada', objetoId: asistente.id });
    expect(u.at(-1)!.antes).toMatchObject({ politica: 'HEREDAR' });
    expect(u.at(-1)!.despues).toMatchObject({ politica: 'OBLIGATORIO' });
    await fijarUsuario(asistente.id, 'HEREDAR');
  });

  it('guardar el mismo valor no genera ruido en la bitácora', async () => {
    const antes = (await eventos(e, { accion: 'parametros.mfa_global_cambiado' })).length;
    await fijarGlobal(true);
    expect((await eventos(e, { accion: 'parametros.mfa_global_cambiado' })).length).toBe(antes);
  });
});
