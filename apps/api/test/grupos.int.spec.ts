/**
 * Jerarquía multiempresa: un "condominio" agrupa varias "copropiedades" (tabla `condominio`).
 * Los permisos siguen siendo por copropiedad; el grupo solo organiza y se ve en `yo`.
 */
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
let B: string;
let C: string;
let sa: { id: string; token: string };
let admin: { token: string };
let adminId: string;
const grupos: string[] = [];

const api = (token: string) => ({
  get: (p: string) => e.http.get(`/api/v1${p}`).set(bearer(token)),
  post: (p: string, d: object) => e.http.post(`/api/v1${p}`).set(bearer(token)).send(d),
  patch: (p: string, d: object) => e.http.patch(`/api/v1${p}`).set(bearer(token)).send(d),
});

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
  C = await crearCondominio(e, 'C');
  const u = await crearUsuario(e, 'grp-sa', { superadmin: true, mfa: true });
  sa = { id: u.id, ...(await iniciarSesion(e, u)) };
  const a = await crearUsuario(e, 'grp-admin', {
    roles: [
      { condominioId: A, rol: 'ADMINISTRADORA' },
      { condominioId: B, rol: 'ADMINISTRADORA' },
      { condominioId: C, rol: 'ASISTENTE' },
    ],
    mfa: true,
  });
  adminId = a.id;
  admin = await iniciarSesion(e, a);
});
afterAll(async () => {
  await e.owner.condominio.updateMany({
    where: { id: { in: e.condominios } },
    data: { grupoId: null },
  });
  await e.owner.grupoCondominio.deleteMany({ where: { id: { in: grupos } } });
  await e.cerrar();
});

describe('Condominios (agrupadores)', () => {
  it('solo el superadministrador los crea, lista o edita', async () => {
    expect((await api(admin.token).get('/admin/grupos')).status).toBe(403);
    expect((await api(admin.token).post('/admin/grupos', { nombre: 'No puede' })).status).toBe(403);
    expect((await e.http.get('/api/v1/admin/grupos')).status).toBe(401);
  });

  it('crea un condominio, audita y rechaza nombres repetidos o vacíos', async () => {
    const nombre = `Majagua ${e.sufijo}`;
    const r = await api(sa.token).post('/admin/grupos', { nombre });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre, copropiedades: 0 });
    grupos.push(r.body.id);
    expect((await eventos(e, { accion: 'grupo.creado', objetoId: r.body.id })).length).toBe(1);
    expect((await api(sa.token).post('/admin/grupos', { nombre })).status).toBe(409);
    expect((await api(sa.token).post('/admin/grupos', { nombre: ' ' })).status).toBe(400);
  });

  it('renombra y lista con el conteo de copropiedades', async () => {
    const g = (await api(sa.token).post('/admin/grupos', { nombre: `Etapa 1 ${e.sufijo}` })).body;
    grupos.push(g.id);
    const nuevo = `Etapa Uno ${e.sufijo}`;
    expect((await api(sa.token).patch(`/admin/grupos/${g.id}`, { nombre: nuevo })).status).toBe(
      200,
    );
    const lista = (await api(sa.token).get('/admin/grupos')).body as {
      id: string;
      nombre: string;
    }[];
    expect(lista.find((x) => x.id === g.id)?.nombre).toBe(nuevo);
    expect(
      (
        await api(sa.token).patch('/admin/grupos/99999999-9999-4999-8999-999999999999', {
          nombre: 'X1',
        })
      ).status,
    ).toBe(404);
  });
});

describe('Asignación de copropiedades', () => {
  let g1: string;
  beforeAll(async () => {
    const r = await api(sa.token).post('/admin/grupos', { nombre: `Torres ${e.sufijo}` });
    g1 = r.body.id;
    grupos.push(g1);
  });

  it('asigna y quita una copropiedad; el listado y el conteo lo reflejan', async () => {
    expect(
      (await api(sa.token).patch(`/admin/condominios/${A}/grupo`, { grupoId: g1 })).status,
    ).toBe(200);
    expect(
      (await api(sa.token).patch(`/admin/condominios/${B}/grupo`, { grupoId: g1 })).status,
    ).toBe(200);
    const cops = (await api(sa.token).get('/admin/condominios')).body as {
      id: string;
      grupoId: string | null;
      grupoNombre: string | null;
    }[];
    expect(cops.find((c) => c.id === A)).toMatchObject({
      grupoId: g1,
      grupoNombre: `Torres ${e.sufijo}`,
    });
    const lista = (await api(sa.token).get('/admin/grupos')).body as {
      id: string;
      copropiedades: number;
    }[];
    expect(lista.find((x) => x.id === g1)?.copropiedades).toBe(2);
    expect(
      (await eventos(e, { accion: 'condominio.grupo_asignado', condominioId: A })).length,
    ).toBe(1);

    expect(
      (await api(sa.token).patch(`/admin/condominios/${B}/grupo`, { grupoId: null })).status,
    ).toBe(200);
    const cops2 = (await api(sa.token).get('/admin/condominios')).body as {
      id: string;
      grupoId: string | null;
    }[];
    expect(cops2.find((c) => c.id === B)?.grupoId).toBeNull();
  });

  it('rechaza un condominio inexistente y una copropiedad inexistente', async () => {
    const falso = '99999999-9999-4999-8999-999999999999';
    expect(
      (await api(sa.token).patch(`/admin/condominios/${A}/grupo`, { grupoId: falso })).status,
    ).toBe(404);
    expect(
      (await api(sa.token).patch(`/admin/condominios/${falso}/grupo`, { grupoId: g1 })).status,
    ).toBe(404);
    expect(
      (await api(admin.token).patch(`/admin/condominios/${A}/grupo`, { grupoId: g1 })).status,
    ).toBe(403);
  });

  it('crear una copropiedad con condominio la deja agrupada', async () => {
    const r = await api(sa.token).post('/admin/condominios', {
      razonSocial: `Copropiedad nueva ${e.sufijo}`,
      nit: `9${Date.now()}`.slice(0, 12),
      grupoId: g1,
    });
    expect(r.status).toBe(201);
    e.condominios.push(r.body.id);
    expect(r.body.grupoId).toBe(g1);
  });

  it('`yo` informa el condominio de cada copropiedad (o null si no tiene)', async () => {
    const r = await api(admin.token).get('/auth/yo');
    const por = Object.fromEntries(
      (
        r.body.condominios as {
          condominioId: string;
          grupoId: string | null;
          grupoNombre: string | null;
        }[]
      ).map((c) => [c.condominioId, c]),
    );
    expect(por[A]).toMatchObject({ grupoId: g1, grupoNombre: `Torres ${e.sufijo}` });
    expect(por[B]!.grupoId).toBeNull();
    expect(por[C]!.grupoNombre).toBeNull();
    void adminId;
  });
});
