/**
 * REQ-002 (TT-000022) · Cargue masivo de propietarios desde Excel. Datos ficticios.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  bearer,
  crearCondominio,
  crearEntorno,
  crearUsuario,
  eventos,
  iniciarSesion,
  type Entorno,
} from './helpers/entorno';

type S = { token: string };
let e: Entorno;
let A: string;
let B: string;
let asistente: S;
let admin: S;
let adminB: S;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cliente = (s: S, c: string) => {
  const con = (r: ReturnType<Entorno['http']['get']>) =>
    r.set(bearer(s.token)).set('x-condominio-id', c);
  return {
    get: (p: string) => con(e.http.get(`/api/v1${p}`)),
    post: (p: string, d: object = {}) => con(e.http.post(`/api/v1${p}`)).send(d),
    subir: (buffer: Buffer, nombre = 'propietarios.xlsx') =>
      con(e.http.post('/api/v1/importaciones/leer')).attach('archivo', buffer, {
        filename: nombre,
        contentType: XLSX_MIME,
      }),
  };
};
const libro = (filas: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Propietarios');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
const COLUMNAS = {
  nombre: 'Nombre',
  unidad: 'Unidad',
  tipoDocumento: 'Tipo documento',
  numeroDocumento: 'Documento',
  correo: 'Correo',
  tipoUnidad: 'Tipo unidad',
};

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
  asistente = await iniciarSesion(
    e,
    await crearUsuario(e, 'imp-asistente', { roles: [{ condominioId: A, rol: 'ASISTENTE' }] }),
  );
  admin = await iniciarSesion(
    e,
    await crearUsuario(e, 'imp-admin', {
      roles: [{ condominioId: A, rol: 'ADMINISTRADORA' }],
      mfa: true,
    }),
  );
  adminB = await iniciarSesion(
    e,
    await crearUsuario(e, 'imp-adminb', {
      roles: [{ condominioId: B, rol: 'ADMINISTRADORA' }],
      mfa: true,
    }),
  );
  await e.owner.unidadPrivada.create({ data: { condominioId: A, codigo: 'V-01', tipo: 'VILLA' } });
});
afterAll(() => e.cerrar());

describe('Cargue masivo de propietarios desde Excel', () => {
  let importacionId: string;

  it('lee el Excel, previsualiza con alertas y no crea nada hasta aprobar', async () => {
    const archivo = libro([
      ['Nombre', 'Unidad', 'Tipo documento', 'Documento', 'Correo', 'Tipo unidad'],
      ['Persona Ficticia Uno', 'V-01', 'CC', '1000001', 'uno@ejemplo.test', ''],
      ['Persona Ficticia Dos', 'L-07', 'CC', '1000002', '', 'LOTE'],
      ['Persona Ficticia Tres', 'X-99', 'CC', '1000003', '', ''],
      ['', 'V-01', 'CC', '1000004', '', ''],
      ['Persona Ficticia Uno', 'V-01', 'CC', '1000001', '', ''],
    ]);
    const leido = await cliente(asistente, A).subir(archivo);
    expect(leido.status).toBe(201);
    expect(leido.body.columnas).toEqual(Object.values(COLUMNAS));
    expect(leido.body.filas).toHaveLength(5);

    const vista = await cliente(asistente, A).post('/importaciones/previsualizar', {
      archivo: 'propietarios.xlsx',
      filas: leido.body.filas,
      columnas: COLUMNAS,
    });
    expect(vista.status).toBe(201);
    expect(vista.body.resumen).toEqual({ total: 5, conAlertas: 3, sinAlertas: 2 });
    const alertas = vista.body.filas.map((f: { alertas: string[] }) => f.alertas.length);
    expect(alertas).toEqual([0, 0, 1, 1, 1]);
    expect(vista.body.filas[1]).toMatchObject({
      unidadDesconocida: true,
      datos: { tipoUnidad: 'LOTE' },
    });
    importacionId = vista.body.id;
    expect(await e.owner.propietario.count({ where: { condominioId: A } })).toBe(0);
    expect((await cliente(asistente, A).get('/importaciones/pendientes')).body).toHaveLength(1);
  });

  it('la asistente no aprueba; la administradora sí y solo entran las filas sin observaciones', async () => {
    expect(
      (await cliente(asistente, A).post('/importaciones/aprobar', { id: importacionId })).status,
    ).toBe(403);
    expect(
      (await cliente(adminB, B).post('/importaciones/aprobar', { id: importacionId })).status,
    ).toBe(404);

    const r = await cliente(admin, A).post('/importaciones/aprobar', { id: importacionId });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ propietarios: 2, unidades: 1, vinculaciones: 2 });

    const lista = await cliente(admin, A).get('/propietarios');
    expect(lista.body.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Persona Ficticia Dos',
      'Persona Ficticia Uno',
    ]);
    const uno = lista.body.find((p: { nombre: string }) => p.nombre === 'Persona Ficticia Uno');
    expect(uno).toMatchObject({ numeroDocumento: '1000001', correo: 'uno@ejemplo.test' });
    expect(uno.titularidades[0]).toMatchObject({
      estado: 'PENDIENTE_VALIDAR',
      unidad: { codigo: 'V-01' },
    });
    expect((await cliente(admin, A).get('/unidades?buscar=L-07')).body[0]).toMatchObject({
      codigo: 'L-07',
      tipo: 'LOTE',
    });

    expect(
      (await cliente(admin, A).post('/importaciones/aprobar', { id: importacionId })).status,
    ).toBe(404);
    expect(
      await eventos(e, { accion: 'propietarios.importacion_aprobada', objetoId: importacionId }),
    ).toHaveLength(1);
    expect(await eventos(e, { accion: 'propietario.importado', condominioId: A })).toHaveLength(2);
    expect((await cliente(adminB, B).get('/propietarios')).body).toEqual([]);
  });

  it('volver a cargar el mismo archivo no duplica propietarios', async () => {
    const leido = await cliente(asistente, A).subir(
      libro([
        ['Nombre', 'Unidad', 'Tipo documento', 'Documento', 'Correo', 'Tipo unidad'],
        ['Persona Ficticia Uno', 'V-01', 'CC', '1000001', '', ''],
      ]),
    );
    const vista = await cliente(asistente, A).post('/importaciones/previsualizar', {
      archivo: 'otra.xlsx',
      filas: leido.body.filas,
      columnas: COLUMNAS,
    });
    expect(vista.body.resumen).toEqual({ total: 1, conAlertas: 1, sinAlertas: 0 });
    expect(vista.body.filas[0].alertas[0]).toContain('duplicado');
    expect(
      (await cliente(admin, A).post('/importaciones/aprobar', { id: vista.body.id })).status,
    ).toBe(409);
    const rechazo = await cliente(admin, A).post(`/importaciones/${vista.body.id}/rechazar`);
    expect(rechazo.status).toBe(201);
    expect(await e.owner.propietario.count({ where: { condominioId: A } })).toBe(2);
  });

  it('la plantilla publicada se puede leer y rechaza archivos de otro tipo', async () => {
    const plantilla = readFileSync(
      join(__dirname, '../../web/public/plantilla-importacion-propietarios.xlsx'),
    );
    const r = await cliente(asistente, A).subir(plantilla);
    expect(r.status).toBe(201);
    expect(r.body.columnas.length).toBeGreaterThan(1);
    expect((await cliente(asistente, A).subir(Buffer.from('%PDF-1.4'), 'lista.pdf')).status).toBe(
      409,
    );
  });
});
