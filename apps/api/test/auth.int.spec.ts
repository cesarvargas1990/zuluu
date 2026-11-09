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
let condo: string;
beforeAll(async () => {
  e = await crearEntorno();
  condo = await crearCondominio(e);
});
afterAll(() => e.cerrar());

describe('Requisito: inicio de sesión con credenciales', () => {
  it('credenciales válidas sin MFA requerido ⇒ sesión completa', async () => {
    const u = await crearUsuario(e, 'asis1', {
      roles: [{ condominioId: condo, rol: 'ASISTENTE' }],
    });
    const r = await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mfaRequerido: false, accessToken: expect.any(String) });
    expect(r.get('set-cookie')?.[0]).toMatch(/zulu_rt=.+HttpOnly.+SameSite=Strict/i);
    const yo = await e.http.get('/api/v1/auth/yo').set(bearer(r.body.accessToken));
    expect(yo.status).toBe(200);
    expect(yo.body.condominios).toEqual([
      expect.objectContaining({ condominioId: condo, rol: 'ASISTENTE' }),
    ]);
  });

  it('email inexistente y contraseña incorrecta dan el mismo 401 genérico', async () => {
    const u = await crearUsuario(e, 'asis2');
    const a = await e.http
      .post('/api/v1/auth/login')
      .send({ email: `nadie.${e.sufijo}@prueba.test`, password: PASSWORD });
    const b = await e.http
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'incorrecta-123456' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('usuario inactivo ⇒ 401 genérico', async () => {
    const u = await crearUsuario(e, 'inactivo', { activo: false });
    const r = await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    expect(r.status).toBe(401);
  });
});

describe('Requisito: protección contra fuerza bruta', () => {
  it('tras 5 fallos responde 429 incluso con la contraseña correcta', async () => {
    const u = await crearUsuario(e, 'bruto');
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await e.http
            .post('/api/v1/auth/login')
            .send({ email: u.email, password: 'mala-contraseña-x' })
        ).status,
      ).toBe(401);
    }
    const r = await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD });
    expect(r.status).toBe(429);
    expect(await eventos(e, { accion: 'auth.login_bloqueado', actorId: u.id })).toHaveLength(1);
  });
});

describe('Requisito: sesiones y renovación', () => {
  it('renovación normal rota el token y el anterior deja de servir', async () => {
    const u = await crearUsuario(e, 'rota');
    const { cookie } = await iniciarSesion(e, u);
    const r1 = await e.http.post('/api/v1/auth/refresh').set('cookie', cookie);
    expect(r1.status).toBe(200);
    const nueva = r1.get('set-cookie')![0]!.split(';')[0]!;
    expect(nueva).not.toBe(cookie);
    const r2 = await e.http.post('/api/v1/auth/refresh').set('cookie', nueva);
    expect(r2.status).toBe(200);
  });

  it('reuso de un token ya usado revoca toda la familia', async () => {
    const u = await crearUsuario(e, 'reuso');
    const { cookie } = await iniciarSesion(e, u);
    const r1 = await e.http.post('/api/v1/auth/refresh').set('cookie', cookie);
    const nueva = r1.get('set-cookie')![0]!.split(';')[0]!;
    const acceso = r1.body.accessToken;

    expect((await e.http.post('/api/v1/auth/refresh').set('cookie', cookie)).status).toBe(401);
    expect((await e.http.post('/api/v1/auth/refresh').set('cookie', nueva)).status).toBe(401);
    expect((await e.http.get('/api/v1/auth/yo').set(bearer(acceso))).status).toBe(401);
    expect(await eventos(e, { accion: 'auth.reuso_renovacion', actorId: u.id })).toHaveLength(1);
  });

  it('cierre de sesión invalida la renovación y el acceso', async () => {
    const u = await crearUsuario(e, 'salir');
    const { cookie, token } = await iniciarSesion(e, u);
    expect((await e.http.post('/api/v1/auth/logout').set(bearer(token))).status).toBe(204);
    expect((await e.http.post('/api/v1/auth/refresh').set('cookie', cookie)).status).toBe(401);
    expect((await e.http.get('/api/v1/auth/yo').set(bearer(token))).status).toBe(401);
  });

  it('refresh desde un origen no permitido ⇒ 403', async () => {
    const u = await crearUsuario(e, 'origen');
    const { cookie } = await iniciarSesion(e, u);
    const r = await e.http
      .post('/api/v1/auth/refresh')
      .set('cookie', cookie)
      .set('origin', 'https://malicioso.test');
    expect(r.status).toBe(403);
  });

  it('sin token ⇒ 401; health es público', async () => {
    expect((await e.http.get('/api/v1/auth/yo')).status).toBe(401);
    expect((await e.http.get('/api/v1/health')).status).toBe(200);
  });
});
