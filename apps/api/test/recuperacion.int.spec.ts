import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  bearer,
  crearEntorno,
  crearUsuario,
  iniciarSesion,
  type Entorno,
} from './helpers/entorno';

let e: Entorno;
beforeAll(async () => {
  e = await crearEntorno();
});
afterAll(() => e.cerrar());

const NUEVA = 'otra-clave-muy-segura';

describe('Requisito: recuperación de contraseña', () => {
  it('responde igual exista o no el email', async () => {
    const u = await crearUsuario(e, 'rec1');
    const a = await e.http.post('/api/v1/auth/recuperar').send({ email: u.email });
    const b = await e.http
      .post('/api/v1/auth/recuperar')
      .send({ email: `nadie.${e.sufijo}@prueba.test` });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(e.mailer.tokenDe(u.email)).toBeDefined();
  });

  it('recuperación exitosa: cambia la contraseña, invalida el token y cierra sesiones', async () => {
    const u = await crearUsuario(e, 'rec2');
    const { token: acceso, cookie } = await iniciarSesion(e, u);
    await e.http.post('/api/v1/auth/recuperar').send({ email: u.email });
    const token = e.mailer.tokenDe(u.email)!;

    expect(
      (await e.http.post('/api/v1/auth/restablecer').send({ token, password: NUEVA })).status,
    ).toBe(204);
    expect((await e.http.get('/api/v1/auth/yo').set(bearer(acceso))).status).toBe(401);
    expect((await e.http.post('/api/v1/auth/refresh').set('cookie', cookie)).status).toBe(401);
    expect(
      (await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD })).status,
    ).toBe(401);
    expect(
      (await e.http.post('/api/v1/auth/login').send({ email: u.email, password: NUEVA })).status,
    ).toBe(200);
    expect(
      (
        await e.http
          .post('/api/v1/auth/restablecer')
          .send({ token, password: 'tercera-clave-segura' })
      ).status,
    ).toBe(400);
  });

  it('token vencido ⇒ 400 sin cambios', async () => {
    const u = await crearUsuario(e, 'rec3');
    await e.http.post('/api/v1/auth/recuperar').send({ email: u.email });
    await e.owner.tokenRecuperacion.updateMany({
      where: { usuarioId: u.id },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });
    const r = await e.http
      .post('/api/v1/auth/restablecer')
      .send({ token: e.mailer.tokenDe(u.email)!, password: NUEVA });
    expect(r.status).toBe(400);
    expect(
      (await e.http.post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD })).status,
    ).toBe(200);
  });

  it('contraseña corta ⇒ 400 con mensaje en español', async () => {
    const u = await crearUsuario(e, 'rec4');
    await e.http.post('/api/v1/auth/recuperar').send({ email: u.email });
    const r = await e.http
      .post('/api/v1/auth/restablecer')
      .send({ token: e.mailer.tokenDe(u.email)!, password: 'corta123' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/al menos 12 caracteres/);
  });
});
