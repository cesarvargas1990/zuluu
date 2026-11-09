import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
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
beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  const u = await crearUsuario(e, 'superadmin', { superadmin: true, mfa: true });
  sa = { id: u.id, ...(await iniciarSesion(e, u)) };
});
afterAll(() => e.cerrar());

const leer = () =>
  e.http.get('/api/v1/prueba/contratos').set(bearer(sa.token)).set('x-condominio-id', A);
const abrir = (horas: number) =>
  e.http.post('/api/v1/accesos-excepcionales').set(bearer(sa.token)).send({
    condominioId: A,
    justificacion: 'Soporte técnico solicitado por la administradora',
    horas,
  });

describe('Requisito: acceso excepcional de superadmin', () => {
  it('sin acceso excepcional ⇒ 403; sí puede gestionar membresías', async () => {
    expect((await leer()).status).toBe(403);
    const lista = await e.http
      .get('/api/v1/membresias')
      .set(bearer(sa.token))
      .set('x-condominio-id', A);
    expect(lista.status).toBe(200);
  });

  it('más de 8 horas o sin justificación ⇒ 400', async () => {
    expect((await abrir(9)).status).toBe(400);
    const r = await e.http
      .post('/api/v1/accesos-excepcionales')
      .set(bearer(sa.token))
      .send({ condominioId: A, justificacion: 'corta', horas: 1 });
    expect(r.status).toBe(400);
  });

  it('acceso vigente permite leer, no escribir, y queda auditado', async () => {
    const a = await abrir(1);
    expect(a.status).toBe(201);
    expect((await leer()).status).toBe(200);
    const aprobar = await e.http
      .post('/api/v1/prueba/finanzas/aprobar')
      .set(bearer(sa.token))
      .set('x-condominio-id', A);
    expect(aprobar.status).toBe(403);
    const usados = await eventos(e, { accion: 'acceso_excepcional.usado', condominioId: A });
    expect(usados[0]?.objetoId).toBe(a.body.id);
    expect(
      await eventos(e, { accion: 'acceso_excepcional.abierto', condominioId: A }),
    ).toHaveLength(1);

    await e.http
      .post(`/api/v1/accesos-excepcionales/${a.body.id}/revocar`)
      .set(bearer(sa.token))
      .send({ condominioId: A });
    expect((await leer()).status).toBe(403);
  });

  it('acceso vencido ⇒ 403 y evento de vencimiento', async () => {
    const a = await abrir(1);
    await e.owner.accesoExcepcional.update({
      where: { id: a.body.id },
      data: { venceEn: new Date(Date.now() - 1000) },
    });
    expect((await leer()).status).toBe(403);
    expect(
      await eventos(e, { accion: 'acceso_excepcional.vencido', objetoId: a.body.id }),
    ).toHaveLength(1);
  });

  it('un usuario no superadmin no puede abrir accesos excepcionales', async () => {
    const u = await crearUsuario(e, 'normal', { roles: [{ condominioId: A, rol: 'ASISTENTE' }] });
    const s = await iniciarSesion(e, u);
    const r = await e.http
      .post('/api/v1/accesos-excepcionales')
      .set(bearer(s.token))
      .send({ condominioId: A, justificacion: 'Intento de acceso sin ser superadmin', horas: 1 });
    expect(r.status).toBe(403);
  });
});
