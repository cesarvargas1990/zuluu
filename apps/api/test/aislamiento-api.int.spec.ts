import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  crearCondominio,
  crearEntorno,
  crearUsuario,
  iniciarSesion,
  type Entorno,
} from './helpers/entorno';

let e: Entorno;
let A: string;
let B: string;
beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
});
afterAll(() => e.cerrar());

describe('Requisito: contexto de condominio (§13.2 por API)', () => {
  it('usuario solo de A no accede a B: 404 sin revelar existencia', async () => {
    const u = await crearUsuario(e, 'soloA', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    });
    const s = await iniciarSesion(e, u);
    const r = await e.http
      .get('/api/v1/prueba/contratos')
      .set(bearer(s.token))
      .set('x-condominio-id', B);
    const inexistente = await e.http
      .get('/api/v1/prueba/contratos')
      .set(bearer(s.token))
      .set('x-condominio-id', '99999999-9999-4999-8999-999999999999');
    expect(r.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(r.body.message).toBe(inexistente.body.message);
  });

  it('ADMINISTRADORA de B no lista ni modifica membresías de A', async () => {
    const adminA = await crearUsuario(e, 'adminA', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    });
    const adminB = await crearUsuario(e, 'adminB', {
      roles: [{ condominioId: B, rol: 'ADMINISTRADORA' }],
      mfa: true,
    });
    const sB = await iniciarSesion(e, adminB);

    const lista = await e.http
      .get('/api/v1/membresias')
      .set(bearer(sB.token))
      .set('x-condominio-id', B);
    expect(lista.status).toBe(200);
    expect(lista.body.map((m: { condominioId: string }) => m.condominioId)).not.toContain(A);

    const modif = await e.http
      .patch(`/api/v1/membresias/${adminA.membresias[0]!.id}`)
      .set(bearer(sB.token))
      .set('x-condominio-id', B)
      .send({ activo: false });
    expect(modif.status).toBe(404);
  });

  it('usuario con membresías en A y B, operando en B, no alcanza recursos de A', async () => {
    const u = await crearUsuario(e, 'ambos', {
      roles: [
        { condominioId: A, rol: 'ADMINISTRADORA' },
        { condominioId: B, rol: 'ADMINISTRADORA' },
      ],
      mfa: true,
    });
    const otroDeA = await crearUsuario(e, 'otroA', {
      roles: [{ condominioId: A, rol: 'ASISTENTE' }],
    });
    const s = await iniciarSesion(e, u);
    const r = await e.http
      .post(`/api/v1/membresias/${otroDeA.membresias[0]!.id}/permisos`)
      .set(bearer(s.token))
      .set('x-condominio-id', B)
      .send({ area: '04', accion: 'leer', efecto: 'CONCEDER' });
    expect(r.status).toBe(404);
  });
});
