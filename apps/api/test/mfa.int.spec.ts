import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  bearer,
  crearCondominio,
  crearEntorno,
  crearUsuario,
  eventos,
  type Entorno,
} from './helpers/entorno';

let e: Entorno;
let condo: string;
beforeAll(async () => {
  e = await crearEntorno();
  condo = await crearCondominio(e);
});
afterAll(() => e.cerrar());

const login = (email: string) =>
  e.http.post('/api/v1/auth/login').send({ email, password: PASSWORD });

describe('Requisito: MFA para perfiles privilegiados', () => {
  it('privilegiado sin MFA solo puede registrarlo; lo demás responde 403', async () => {
    const u = await crearUsuario(e, 'admin-sin-mfa', {
      roles: [{ condominioId: condo, rol: 'ADMINISTRADORA' }],
    });
    const r = await login(u.email);
    expect(r.body).toMatchObject({ mfaRequerido: true, mfaConfigurado: false });
    const token = r.body.accessToken;

    const listado = await e.http
      .get('/api/v1/membresias')
      .set(bearer(token))
      .set('x-condominio-id', condo);
    expect(listado.status).toBe(403);

    const reg = await e.http.post('/api/v1/auth/mfa/registro').set(bearer(token));
    expect(reg.status).toBe(200);
    expect(reg.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    const conf = await e.http
      .post('/api/v1/auth/mfa/confirmar')
      .set(bearer(token))
      .send({ codigo: authenticator.generate(reg.body.secreto) });
    expect(conf.status).toBe(200);
    expect(conf.body.codigosRespaldo).toHaveLength(10);

    const ahora = await e.http
      .get('/api/v1/membresias')
      .set(bearer(conf.body.accessToken))
      .set('x-condominio-id', condo);
    expect(ahora.status).toBe(200);
  });

  it('privilegiado con MFA configurado obtiene sesión completa tras TOTP válido', async () => {
    const u = await crearUsuario(e, 'conta', {
      roles: [{ condominioId: condo, rol: 'CONTADORA' }],
      mfa: true,
    });
    const r = await login(u.email);
    expect(r.body).toMatchObject({ mfaRequerido: true, mfaConfigurado: true });
    const malo = await e.http
      .post('/api/v1/auth/mfa/verificar')
      .set(bearer(r.body.accessToken))
      .send({ codigo: '000000' });
    expect(malo.status).toBe(401);
    const ok = await e.http
      .post('/api/v1/auth/mfa/verificar')
      .set(bearer(r.body.accessToken))
      .send({ codigo: authenticator.generate(u.secreto!) });
    expect(ok.status).toBe(200);
    expect(await eventos(e, { accion: 'auth.mfa_fallido', actorId: u.id })).toHaveLength(1);
  });

  it('código de respaldo funciona una sola vez', async () => {
    const u = await crearUsuario(e, 'juri', {
      roles: [{ condominioId: condo, rol: 'ASESOR_JURIDICO' }],
    });
    const t = (await login(u.email)).body.accessToken;
    const reg = await e.http.post('/api/v1/auth/mfa/registro').set(bearer(t));
    const conf = await e.http
      .post('/api/v1/auth/mfa/confirmar')
      .set(bearer(t))
      .send({ codigo: authenticator.generate(reg.body.secreto) });
    const respaldo: string = conf.body.codigosRespaldo[0];

    const t2 = (await login(u.email)).body.accessToken;
    expect(
      (await e.http.post('/api/v1/auth/mfa/verificar').set(bearer(t2)).send({ codigo: respaldo }))
        .status,
    ).toBe(200);
    const t3 = (await login(u.email)).body.accessToken;
    expect(
      (await e.http.post('/api/v1/auth/mfa/verificar').set(bearer(t3)).send({ codigo: respaldo }))
        .status,
    ).toBe(401);
  });

  it('superadmin siempre requiere MFA', async () => {
    const u = await crearUsuario(e, 'sa', { superadmin: true });
    expect((await login(u.email)).body.mfaRequerido).toBe(true);
  });

  it('el secreto TOTP no queda en claro en la base ni en la bitácora', async () => {
    const u = await crearUsuario(e, 'secreto', {
      roles: [{ condominioId: condo, rol: 'ADMINISTRADORA' }],
    });
    const t = (await login(u.email)).body.accessToken;
    const reg = await e.http.post('/api/v1/auth/mfa/registro').set(bearer(t));
    const fila = await e.owner.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(fila.mfaSecretoCifrado).not.toContain(reg.body.secreto);
    const bitacora = JSON.stringify(await eventos(e, { actorId: u.id }), (_k, v) =>
      typeof v === 'bigint' ? String(v) : v,
    );
    expect(bitacora).not.toContain(reg.body.secreto);
  });
});
