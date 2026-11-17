import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  bearer,
  crearCondominio,
  crearEntorno,
  crearUsuario,
  iniciarSesion,
  type Entorno,
} from './helpers/entorno';

type S = { token: string };
let e: Entorno;
let a: string;
let b: string;
let u: string;
let ca: S;
let cb: S;
const cliente = (s: S, c: string) => ({
  get: (p: string) => e.http.get(`/api/v1${p}`).set(bearer(s.token)).set('x-condominio-id', c),
  post: (p: string, d: object) =>
    e.http.post(`/api/v1${p}`).set(bearer(s.token)).set('x-condominio-id', c).send(d),
  subir: (p: string, buffer: Buffer) =>
    e.http
      .post(`/api/v1${p}`)
      .set(bearer(s.token))
      .set('x-condominio-id', c)
      .field('fechaCorte', '2026-11-01')
      .attach('archivo', buffer, {
        filename: 'saldos.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
});
beforeAll(async () => {
  e = await crearEntorno();
  a = await crearCondominio(e, 'A');
  b = await crearCondominio(e, 'B');
  const ua = await crearUsuario(e, 'cartera-a', {
    roles: [{ condominioId: a, rol: 'CONTADORA' }],
    mfa: true,
  });
  const ub = await crearUsuario(e, 'cartera-b', {
    roles: [{ condominioId: b, rol: 'CONTADORA' }],
    mfa: true,
  });
  ca = await iniciarSesion(e, ua);
  cb = await iniciarSesion(e, ub);
  u = (
    await e.owner.unidadPrivada.create({
      data: { condominioId: a, codigo: 'V-401', tipo: 'VILLA' },
    })
  ).id;
});
afterAll(() => e.cerrar());

describe('REQ-004 cartera', () => {
  it('crea obligación, calcula mora y aísla por condominio', async () => {
    const r = await cliente(ca, a).post('/cartera/obligaciones', {
      unidadId: u,
      concepto: 'CUOTA_ADMINISTRACION',
      periodo: '2026-09',
      fechaEmision: '2026-09-01',
      fechaVencimiento: '2026-09-10',
      valor: 500000,
    });
    expect(r.status).toBe(201);
    const listado = await cliente(ca, a).get('/cartera');
    expect(listado.status).toBe(200);
    expect(listado.body.resumen.total).toBe('500000.00');
    expect(listado.body.obligaciones[0]).toMatchObject({
      unidad: { codigo: 'V-401' },
      saldo: '500000',
      estado: 'VENCIDA',
      tramo: '61_90',
    });
    const ajeno = await cliente(cb, b).get('/cartera');
    expect(ajeno.body.obligaciones).toEqual([]);
  });
  it('solo al verificar un recaudo aplica saldo a una obligación existente', async () => {
    const o = (
      await cliente(ca, a).post('/cartera/obligaciones', {
        unidadId: u,
        concepto: 'CUOTA_ADMINISTRACION',
        periodo: '2026-10',
        fechaEmision: '2026-10-01',
        fechaVencimiento: '2026-10-10',
        valor: 250000,
      })
    ).body;
    const pago = await cliente(ca, a).post('/recaudos', {
      unidadId: u,
      fechaPago: '2026-10-15',
      valor: 100000,
      medio: 'TRANSFERENCIA',
    });
    expect(pago.status).toBe(201);
    let listado = await cliente(ca, a).get('/cartera');
    expect(listado.body.obligaciones.find((x: { id: string }) => x.id === o.id).saldo).toBe(
      '250000',
    );
    const verificado = await cliente(ca, a).post(`/recaudos/${pago.body.id}/verificar`, {
      imputaciones: [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-10',
          valorObligacion: 250000,
          valorAplicado: 100000,
        },
      ],
    });
    expect(verificado.status).toBe(200);
    listado = await cliente(ca, a).get('/cartera');
    expect(listado.body.obligaciones.find((x: { id: string }) => x.id === o.id).saldo).toBe(
      '150000',
    );
    const anulacion = await cliente(ca, a).post(`/recaudos/${pago.body.id}/anular`, {
      motivo: 'Reverso ficticio para validar libro de cartera.',
    });
    expect(anulacion.status).toBe(200);
    listado = await cliente(ca, a).get('/cartera');
    expect(listado.body.obligaciones.find((x: { id: string }) => x.id === o.id).saldo).toBe(
      '250000',
    );
  });
  it('previsualiza y aprueba saldos iniciales con trazabilidad', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          unidad: 'V-401',
          periodo: '2026-08',
          fechaVencimiento: '2026-08-10',
          valor: 120000,
          descripcion: 'Saldo de apertura',
        },
      ]),
      'Saldos',
    );
    const archivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const vista = await cliente(ca, a).subir('/cartera/importaciones/previsualizar', archivo);
    expect(vista.status).toBe(201);
    expect(vista.body.resumen).toMatchObject({ total: 1, validas: 1, errores: 0 });
    const aprobada = await cliente(ca, a).post(
      `/cartera/importaciones/${vista.body.id}/aprobar`,
      {},
    );
    expect(aprobada.status).toBe(201);
    expect(aprobada.body.filas).toBe(1);
    const filas = await cliente(ca, a).get('/cartera?periodoDesde=2026-08&periodoHasta=2026-08');
    expect(filas.body.obligaciones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ concepto: 'SALDO_INICIAL', saldo: '120000' }),
      ]),
    );
  });
});
