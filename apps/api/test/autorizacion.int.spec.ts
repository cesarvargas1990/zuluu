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
let admin: { token: string };
beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  admin = await iniciarSesion(
    e,
    await crearUsuario(e, 'admin', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    }),
  );
});
afterAll(() => e.cerrar());

const get = (ruta: string, token: string, condo = A) =>
  e.http.get(`/api/v1/prueba/${ruta}`).set(bearer(token)).set('x-condominio-id', condo);

async function sesionCon(
  alias: string,
  rol: Parameters<typeof crearUsuario>[2] extends infer O
    ? O extends { roles?: (infer R)[] }
      ? R extends { rol: infer X }
        ? X
        : never
      : never
    : never,
) {
  const u = await crearUsuario(e, alias, { roles: [{ condominioId: A, rol }] });
  return { ...u, ...(await iniciarSesion(e, u)) };
}

describe('Requisito: denegación por defecto', () => {
  it('ASISTENTE no aprueba pagos (§13.1) y queda auditado', async () => {
    const s = await sesionCon('asis', 'ASISTENTE');
    const r = await e.http
      .post('/api/v1/prueba/finanzas/aprobar')
      .set(bearer(s.token))
      .set('x-condominio-id', A);
    expect(r.status).toBe(403);
    const ev = await eventos(e, {
      accion: 'autorizacion.denegado',
      actorId: s.id,
      condominioId: A,
    });
    expect(ev[0]?.despues).toMatchObject({ area: '02', accion: 'aprobar' });
  });

  it('ASISTENTE no lee Jurídica sin concesión (§13.1)', async () => {
    const s = await sesionCon('asis2', 'ASISTENTE');
    expect((await get('juridico', s.token)).status).toBe(403);
  });

  it('CONTADORA sí aprueba pagos (matriz del rol)', async () => {
    const u = await crearUsuario(e, 'conta', {
      roles: [{ condominioId: A, rol: 'CONTADORA' }],
      mfa: true,
    });
    const s = await iniciarSesion(e, u);
    const r = await e.http
      .post('/api/v1/prueba/finanzas/aprobar')
      .set(bearer(s.token))
      .set('x-condominio-id', A);
    expect(r.status).toBe(201);
  });

  it('OPERACIONES no lee Finanzas', async () => {
    const s = await sesionCon('ops', 'OPERACIONES');
    expect((await get('finanzas', s.token)).status).toBe(403);
  });

  it('CONSEJO no tiene acceso por defecto', async () => {
    const s = await sesionCon('consejo', 'CONSEJO');
    expect((await get('consejo', s.token)).status).toBe(403);
  });

  it('sin encabezado X-Condominio-Id ⇒ 400', async () => {
    const s = await sesionCon('sinhdr', 'ASISTENTE');
    expect((await e.http.get('/api/v1/prueba/contratos').set(bearer(s.token))).status).toBe(400);
  });
});

describe('Requisito: concesiones y restricciones', () => {
  it('concesión explícita habilita y su revocación deshabilita', async () => {
    const s = await sesionCon('asis3', 'ASISTENTE');
    const m = s.membresias[0]!;
    expect((await get('juridico', s.token)).status).toBe(403);

    const p = await e.http
      .post(`/api/v1/membresias/${m.id}/permisos`)
      .set(bearer(admin.token))
      .set('x-condominio-id', A)
      .send({ area: '04', accion: 'leer', efecto: 'CONCEDER' });
    expect(p.status).toBe(201);
    expect((await get('juridico', s.token)).status).toBe(200);

    const rv = await e.http
      .post(`/api/v1/membresias/permisos/${p.body.id}/revocar`)
      .set(bearer(admin.token))
      .set('x-condominio-id', A);
    expect(rv.status).toBe(200);
    expect((await get('juridico', s.token)).status).toBe(403);
  });

  it('restricción por expediente prevalece sobre el rol', async () => {
    const u = await crearUsuario(e, 'juri', {
      roles: [{ condominioId: A, rol: 'ASESOR_JURIDICO' }],
      mfa: true,
    });
    const s = await iniciarSesion(e, u);
    const expX = '11111111-1111-4111-8111-111111111111';
    await e.http
      .post(`/api/v1/membresias/${u.membresias[0]!.id}/permisos`)
      .set(bearer(admin.token))
      .set('x-condominio-id', A)
      .send({ area: '04', accion: 'leer', efecto: 'RESTRINGIR', expedienteId: expX });
    expect((await get(`juridico/expedientes/${expX}`, s.token)).status).toBe(403);
    expect(
      (await get('juridico/expedientes/22222222-2222-4222-8222-222222222222', s.token)).status,
    ).toBe(200);
  });
});

describe('Requisito: gestión de membresías y permisos', () => {
  it('ASISTENTE no puede otorgar permisos', async () => {
    const s = await sesionCon('asis4', 'ASISTENTE');
    const r = await e.http
      .post(`/api/v1/membresias/${s.membresias[0]!.id}/permisos`)
      .set(bearer(s.token))
      .set('x-condominio-id', A)
      .send({ area: '04', accion: 'leer', efecto: 'CONCEDER' });
    expect(r.status).toBe(403);
  });

  it('desactivar una membresía corta el acceso en la siguiente petición (404)', async () => {
    const s = await sesionCon('asis5', 'ASISTENTE');
    expect((await get('contratos', s.token)).status).toBe(200);
    const r = await e.http
      .patch(`/api/v1/membresias/${s.membresias[0]!.id}`)
      .set(bearer(admin.token))
      .set('x-condominio-id', A)
      .send({ activo: false });
    expect(r.status).toBe(200);
    expect((await get('contratos', s.token)).status).toBe(404);
  });

  it('crear membresía para email nuevo crea el usuario y envía enlace de bienvenida', async () => {
    const email = `nuevo.${e.sufijo}@prueba.test`;
    const r = await e.http
      .post('/api/v1/membresias')
      .set(bearer(admin.token))
      .set('x-condominio-id', A)
      .send({ email, nombre: 'Nueva Persona', rol: 'OPERACIONES' });
    expect(r.status).toBe(201);
    expect(e.mailer.tokenDe(email)).toBeDefined();
  });

  it('si el correo de bienvenida falla, la membresía se crea igual e informa correoEnviado=false', async () => {
    const email = `sincorreo.${e.sufijo}@prueba.test`;
    e.mailer.fallar = true;
    try {
      const r = await e.http
        .post('/api/v1/membresias')
        .set(bearer(admin.token))
        .set('x-condominio-id', A)
        .send({ email, nombre: 'Sin Correo', rol: 'OPERACIONES' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ nuevoUsuario: true, correoEnviado: false });
    } finally {
      e.mailer.fallar = false;
    }
  });
});
