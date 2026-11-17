/**
 * REQ-003 · Registro de pagos y recaudos. Cubre CA-01 a CA-09 y el aislamiento entre condominios.
 * Datos ficticios. Requiere `pnpm db:up` + migraciones.
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
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

type Sesion = { token: string };
let e: Entorno;
let A: string;
let B: string;
let asistente: Sesion;
let contadora: Sesion;
let adminB: Sesion;
let contadoraId: string;
let unidad1: string;
let unidad2: string;
let propietario1: string;

const PDF = Buffer.from('%PDF-1.4\n% comprobante ficticio de prueba\n%%EOF\n');

const cliente = (s: Sesion, condominio: string) => {
  const con = (r: ReturnType<Entorno['http']['get']>) =>
    r.set(bearer(s.token)).set('x-condominio-id', condominio);
  return {
    get: (ruta: string) => con(e.http.get(`/api/v1${ruta}`)),
    post: (ruta: string, cuerpo?: object) => con(e.http.post(`/api/v1${ruta}`)).send(cuerpo),
    patch: (ruta: string, cuerpo: object) => con(e.http.patch(`/api/v1${ruta}`)).send(cuerpo),
    subir: (ruta: string, contenido: Buffer, nombre: string, tipo: string) =>
      con(e.http.post(`/api/v1${ruta}`)).attach('archivo', contenido, {
        filename: nombre,
        contentType: tipo,
      }),
  };
};

const pago = (extra: object = {}) => ({
  fechaPago: '2026-11-10',
  valor: 580000,
  medio: 'TRANSFERENCIA',
  ...extra,
});

async function registrar(extra: object = {}, s: Sesion = asistente) {
  const r = await cliente(s, A).post('/recaudos', pago(extra));
  if (r.status !== 201) throw new Error(`registro ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body as { id: string; numero: number; estado: string };
}

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
  const uAsistente = await crearUsuario(e, 'asistente', {
    roles: [{ condominioId: A, rol: 'ASISTENTE' }],
  });
  const uContadora = await crearUsuario(e, 'contadora', {
    roles: [{ condominioId: A, rol: 'CONTADORA' }],
    mfa: true,
  });
  const uAdminB = await crearUsuario(e, 'adminB', {
    roles: [{ condominioId: B, rol: 'ADMINISTRADORA' }],
    mfa: true,
  });
  contadoraId = uContadora.id;
  asistente = await iniciarSesion(e, uAsistente);
  contadora = await iniciarSesion(e, uContadora);
  adminB = await iniciarSesion(e, uAdminB);
  unidad1 = (
    await e.owner.unidadPrivada.create({
      data: { condominioId: A, codigo: '101-1', tipo: 'VILLA' },
    })
  ).id;
  unidad2 = (
    await e.owner.unidadPrivada.create({ data: { condominioId: A, codigo: '102-1', tipo: 'LOTE' } })
  ).id;
  propietario1 = (
    await e.owner.propietario.create({ data: { condominioId: A, nombre: 'Persona Ficticia Uno' } })
  ).id;
  await e.owner.titularidad.create({
    data: { condominioId: A, propietarioId: propietario1, unidadId: unidad1, tipo: 'TITULAR' },
  });
});
afterAll(() => e.cerrar());

describe('Requisito: registro de pago', () => {
  it('CA-01: pago válido queda pendiente, con número y soporte', async () => {
    const r = await cliente(asistente, A).post(
      '/recaudos',
      pago({
        unidadId: unidad1,
        propietarioId: propietario1,
        referencia: 'TRX-CA01',
        valor: 580000,
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      estado: 'PENDIENTE',
      numero: 1,
      numeroVisible: 'RC-0001',
      valor: '580000',
      fechaPago: '2026-11-10',
      unidadId: unidad1,
      posibleDuplicado: false,
    });

    const s = await cliente(asistente, A).subir(
      `/recaudos/${r.body.id}/soportes`,
      PDF,
      'comprobante.pdf',
      'application/pdf',
    );
    expect(s.status).toBe(201);
    expect(s.body.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
    expect(s.body.contenido).toBeUndefined();

    const ev = await eventos(e, { accion: 'recaudo.registrado', objetoId: r.body.id });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.condominioId).toBe(A);

    const otro = await registrar({ valor: 111000 });
    expect(otro.numero).toBe(2);
  });

  it.each([
    ['valor cero', { valor: 0 }],
    ['valor negativo', { valor: -100 }],
    ['valor no numérico', { valor: 'abc' }],
    ['más de dos decimales', { valor: 100.123 }],
    ['fecha inexistente', { fechaPago: '2026-02-31' }],
    ['fecha futura', { fechaPago: '2099-01-01' }],
    ['medio desconocido', { medio: 'CHEQUE' }],
    ['campo desconocido', { estado: 'VERIFICADO' }],
  ])('rechaza %s con 400', async (_nombre, extra) => {
    const r = await cliente(asistente, A).post('/recaudos', pago(extra));
    expect(r.status).toBe(400);
  });

  it('rechaza una unidad que no existe en el condominio', async () => {
    const r = await cliente(asistente, A).post(
      '/recaudos',
      pago({ unidadId: '99999999-9999-4999-8999-999999999999', valor: 123 }),
    );
    expect(r.status).toBe(404);
  });
});

describe('Requisito: posibles duplicados', () => {
  it('CA-02: advierte y exige confirmación', async () => {
    await registrar({ referencia: 'TRX-DUP', valor: 563000, unidadId: unidad2 });
    const total = () => e.owner.recaudo.count({ where: { condominioId: A, valor: 563000 } });

    const r = await cliente(asistente, A).post(
      '/recaudos',
      pago({ referencia: 'trx-dup', valor: 563000, fechaPago: '2026-11-11' }),
    );
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toBe('Encontramos un pago similar. Revise antes de continuar.');
    expect(r.body.duplicados).toHaveLength(1);
    expect(r.body.duplicados[0].referencia).toBe('TRX-DUP');
    expect(await total()).toBe(1);

    const porFechaYUnidad = await cliente(asistente, A).post(
      '/recaudos',
      pago({ valor: 563000, unidadId: unidad2 }),
    );
    expect(porFechaYUnidad.status).toBe(409);

    const ok = await cliente(asistente, A).post(
      '/recaudos',
      pago({ referencia: 'trx-dup', valor: 563000, confirmarDuplicado: true }),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.posibleDuplicado).toBe(true);
    expect(await total()).toBe(2);
  });

  it('mismo valor con otra referencia y otra unidad no es duplicado', async () => {
    await registrar({ referencia: 'REF-A', valor: 777000, unidadId: unidad1 });
    const r = await cliente(asistente, A).post(
      '/recaudos',
      pago({ referencia: 'REF-B', valor: 777000, unidadId: unidad2 }),
    );
    expect(r.status).toBe(201);
  });
});

describe('Requisito: pagos por identificar', () => {
  it('CA-03: sin unidad no se verifica; al asignarla sale de la bandeja', async () => {
    const p = await registrar({ referencia: 'TRX-SINUNIDAD', valor: 400000 });
    const bandeja = async () =>
      (await cliente(contadora, A).get('/recaudos?bandeja=identificar')).body.items.map(
        (i: { id: string }) => i.id,
      );
    expect(await bandeja()).toContain(p.id);

    const v = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, { imputaciones: [] });
    expect(v.status).toBe(409);

    const negado = await cliente(asistente, A).patch(`/recaudos/${p.id}`, { unidadId: unidad1 });
    expect(negado.status).toBe(403);

    const asignado = await cliente(contadora, A).patch(`/recaudos/${p.id}`, { unidadId: unidad1 });
    expect(asignado.status).toBe(200);
    expect(asignado.body.unidadId).toBe(unidad1);
    expect(await bandeja()).not.toContain(p.id);
    expect(await eventos(e, { accion: 'recaudo.identificado', objetoId: p.id })).toHaveLength(1);
  });
});

describe('Requisito: verificación e imputación', () => {
  it('CA-04: abono parcial deja saldo pendiente', async () => {
    const p = await registrar({ valor: 300000, unidadId: unidad1, referencia: 'TRX-PARCIAL' });
    const r = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-11',
          valorObligacion: 580000,
          valorAplicado: 300000,
        },
      ],
      observacion: 'Abono parcial',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'VERIFICADO',
      saldoAFavor: '0',
      revisadoPor: contadoraId,
    });
    expect(r.body.imputaciones).toHaveLength(1);
    expect(r.body.imputaciones[0]).toMatchObject({
      valorAplicado: '300000',
      saldoPendiente: '280000',
    });
    const ev = await eventos(e, { accion: 'recaudo.verificado', objetoId: p.id });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.antes).toMatchObject({ estado: 'PENDIENTE' });
  });

  it('CA-05: el excedente queda como saldo a favor y no se duplica', async () => {
    const p = await registrar({ valor: 700000, unidadId: unidad1, referencia: 'TRX-EXCEDENTE' });
    const r = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-11',
          valorObligacion: 580000,
          valorAplicado: 580000,
        },
      ],
    });
    expect(r.body.saldoAFavor).toBe('120000');

    const otraVez = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [],
    });
    expect(otraVez.status).toBe(409);
    const d1 = await cliente(contadora, A).get(`/recaudos/${p.id}`);
    const d2 = await cliente(contadora, A).get(`/recaudos/${p.id}`);
    expect(d1.body.saldoAFavor).toBe('120000');
    expect(d2.body.saldoAFavor).toBe('120000');
    expect(d2.body.imputaciones).toHaveLength(1);

    const lista = await cliente(contadora, A).get(`/recaudos?buscar=TRX-EXCEDENTE`);
    expect(lista.body.resumen.saldoAFavor).toBe('120000');
  });

  it('rechaza imputar más que el pago y lo deja pendiente', async () => {
    const p = await registrar({ valor: 500000, unidadId: unidad1, referencia: 'TRX-EXCESO' });
    const r = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [{ concepto: 'CUOTA_VENCIDA', periodo: '2026-10', valorAplicado: 500001 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('La suma aplicada no puede superar el valor del pago.');
    const d = await cliente(contadora, A).get(`/recaudos/${p.id}`);
    expect(d.body.estado).toBe('PENDIENTE');
    expect(d.body.imputaciones).toHaveLength(0);
  });

  it('un pago observado exige observación y puede verificarse después', async () => {
    const p = await registrar({ valor: 587000, unidadId: unidad2, medio: 'EFECTIVO' });
    const sinTexto = await cliente(contadora, A).post(`/recaudos/${p.id}/observar`, {});
    expect(sinTexto.status).toBe(400);
    const o = await cliente(contadora, A).post(`/recaudos/${p.id}/observar`, {
      observacion: 'El comprobante no es legible',
    });
    expect(o.status).toBe(200);
    expect(o.body.estado).toBe('OBSERVADO');
    const revision = await cliente(contadora, A).get('/recaudos?bandeja=revision');
    expect(revision.body.items.map((i: { id: string }) => i.id)).toContain(p.id);
    const v = await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, { imputaciones: [] });
    expect(v.status).toBe(200);
    expect(v.body.saldoAFavor).toBe('587000');
  });
});

describe('Requisito: anulación sin borrado', () => {
  it('CA-06: exige motivo, conserva historial e imputaciones', async () => {
    const p = await registrar({ valor: 610000, unidadId: unidad1, referencia: 'TRX-ANULAR' });
    await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: 610000 },
      ],
    });

    const sinMotivo = await cliente(contadora, A).post(`/recaudos/${p.id}/anular`, { motivo: ' ' });
    expect(sinMotivo.status).toBe(400);

    const r = await cliente(contadora, A).post(`/recaudos/${p.id}/anular`, {
      motivo: 'Pago registrado dos veces por error',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      estado: 'ANULADO',
      anuladoPor: contadoraId,
      motivoAnulacion: 'Pago registrado dos veces por error',
    });
    expect(r.body.imputaciones).toHaveLength(1);

    const ev = await eventos(e, { accion: 'recaudo.anulado', objetoId: p.id });
    expect(ev[0]!.antes).toMatchObject({ estado: 'VERIFICADO' });
    expect(ev[0]!.despues).toMatchObject({ estado: 'ANULADO' });

    for (const intento of [
      cliente(contadora, A).post(`/recaudos/${p.id}/anular`, { motivo: 'Otra vez anulado' }),
      cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, { imputaciones: [] }),
      cliente(contadora, A).patch(`/recaudos/${p.id}`, { pagador: 'Otro' }),
    ]) {
      expect((await intento).status).toBe(409);
    }
    expect(await e.owner.recaudo.count({ where: { id: p.id } })).toBe(1);
  });

  it('un pago verificado no se modifica', async () => {
    const p = await registrar({ valor: 620000, unidadId: unidad1 });
    await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, { imputaciones: [] });
    const r = await cliente(contadora, A).patch(`/recaudos/${p.id}`, { valor: 1 });
    expect(r.status).toBe(409);
  });

  it('el rol de aplicación no puede borrar pagos ni cambiar imputaciones', async () => {
    const app = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      await expect(app.$executeRaw`DELETE FROM recaudo`).rejects.toThrow();
      await expect(
        app.$executeRaw`UPDATE imputacion_recaudo SET valor_aplicado = 1`,
      ).rejects.toThrow();
      await expect(app.$executeRaw`DELETE FROM soporte_recaudo`).rejects.toThrow();
    } finally {
      await app.$disconnect();
    }
  });
});

describe('Requisito: permisos', () => {
  it('CA-07: la asistente no verifica, observa, anula, modifica ni exporta', async () => {
    const p = await registrar({ valor: 630000, unidadId: unidad1 });
    const c = cliente(asistente, A);
    for (const intento of [
      c.post(`/recaudos/${p.id}/verificar`, { imputaciones: [] }),
      c.post(`/recaudos/${p.id}/observar`, { observacion: 'No corresponde' }),
      c.post(`/recaudos/${p.id}/anular`, { motivo: 'Motivo cualquiera' }),
      c.patch(`/recaudos/${p.id}`, { valor: 1 }),
      c.get('/recaudos/exportar'),
    ]) {
      expect((await intento).status).toBe(403);
    }
    const d = await c.get(`/recaudos/${p.id}`);
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ estado: 'PENDIENTE', valor: '630000' });
  });

  it('sin sesión responde 401', async () => {
    expect((await e.http.get('/api/v1/recaudos')).status).toBe(401);
  });

  it('la contadora exporta y queda auditado', async () => {
    const r = await cliente(contadora, A).get('/recaudos/exportar?estado=VERIFICADO');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((i: { estado: string }) => i.estado === 'VERIFICADO')).toBe(true);
    const ev = await eventos(e, { accion: 'recaudos.exportados', condominioId: A });
    expect(ev.at(-1)!.despues).toMatchObject({ registros: r.body.items.length });
  });
});

describe('Requisito: consulta y detalle', () => {
  it('CA-09: el detalle muestra imputaciones, soporte y auditoría', async () => {
    const p = await registrar({
      valor: 640000,
      unidadId: unidad1,
      propietarioId: propietario1,
      referencia: 'TRX-DETALLE',
      pagador: 'Pagador ejemplo A',
      banco: 'Banco Ficticio',
    });
    await cliente(asistente, A).subir(
      `/recaudos/${p.id}/soportes`,
      PDF,
      'soporte.pdf',
      'application/pdf',
    );
    await cliente(contadora, A).post(`/recaudos/${p.id}/verificar`, {
      imputaciones: [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: 640000 },
      ],
    });
    const d = await cliente(contadora, A).get(`/recaudos/${p.id}`);
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({
      estado: 'VERIFICADO',
      unidad: { codigo: '101-1' },
      propietario: { nombre: 'Persona Ficticia Uno' },
    });
    expect(d.body.imputaciones).toHaveLength(1);
    expect(d.body.soportes).toHaveLength(1);
    expect(d.body.soportes[0]).toMatchObject({
      nombre: 'soporte.pdf',
      mimeType: 'application/pdf',
    });
    expect(d.body.soportes[0].contenido).toBeUndefined();
    const acciones = d.body.historial.map((h: { accion: string }) => h.accion);
    expect(acciones).toEqual(
      expect.arrayContaining([
        'recaudo.registrado',
        'recaudo.soporte_cargado',
        'recaudo.verificado',
      ]),
    );
    const verificado = d.body.historial.find(
      (h: { accion: string }) => h.accion === 'recaudo.verificado',
    );
    expect(verificado.actor).toBe('contadora');
  });

  it('filtra por estado, medio, unidad, propietario, fechas y texto', async () => {
    const p = await registrar({
      valor: 650000,
      unidadId: unidad2,
      medio: 'CONSIGNACION',
      referencia: 'CON-FILTRO-8831',
      fechaPago: '2026-09-15',
    });
    const ids = async (consulta: string) =>
      (await cliente(contadora, A).get(`/recaudos?${consulta}`)).body.items.map(
        (i: { id: string }) => i.id,
      );

    expect(await ids('buscar=filtro-8831')).toEqual([p.id]);
    expect(await ids('buscar=RC-0001')).toHaveLength(1);
    expect(await ids('medio=CONSIGNACION&desde=2026-09-01&hasta=2026-09-30')).toEqual([p.id]);
    expect(await ids('desde=2026-09-16&hasta=2026-09-30')).toEqual([]);
    expect(await ids(`unidadId=${unidad2}&estado=PENDIENTE`)).toContain(p.id);
    expect(await ids(`unidadId=${unidad1}`)).not.toContain(p.id);
    // Por propietario: pagos a su nombre o de las unidades donde es titular vigente.
    const delPropietario = await ids(`propietarioId=${propietario1}`);
    expect(delPropietario.length).toBeGreaterThan(0);
    expect(delPropietario).not.toContain(p.id);
    expect((await cliente(contadora, A).get('/recaudos?estado=NADA')).status).toBe(400);

    const r = await cliente(contadora, A).get(
      '/recaudos?medio=CONSIGNACION&desde=2026-09-01&hasta=2026-09-30',
    );
    expect(r.body.resumen).toMatchObject({
      total: 1,
      valorRecibido: '650000',
      pendientes: 1,
      sinIdentificar: 0,
    });
  });
});

describe('Requisito: soportes', () => {
  it('rechaza tipos no permitidos y extensiones falsas', async () => {
    const p = await registrar({ valor: 660000 });
    const c = cliente(asistente, A);
    const texto = await c.subir(
      `/recaudos/${p.id}/soportes`,
      Buffer.from('hola'),
      'nota.txt',
      'text/plain',
    );
    const falso = await c.subir(
      `/recaudos/${p.id}/soportes`,
      Buffer.from('MZ no soy pdf'),
      'falso.pdf',
      'application/pdf',
    );
    expect(texto.status).toBe(400);
    expect(falso.status).toBe(400);
    expect(falso.body.message).toBe('El archivo no cumple el formato o tamaño permitido.');
    expect(await e.owner.soporteRecaudo.count({ where: { recaudoId: p.id } })).toBe(0);
  });

  it('la descarga exige lectura y queda auditada', async () => {
    const p = await registrar({ valor: 670000 });
    const s = await cliente(asistente, A).subir(
      `/recaudos/${p.id}/soportes`,
      PDF,
      '../../comp.pdf',
      'application/pdf',
    );
    expect(s.body.nombre).not.toContain('/');
    const d = await cliente(contadora, A).get(`/recaudos/${p.id}/soportes/${s.body.id}`);
    expect(d.status).toBe(200);
    expect(Buffer.from(d.body.contenido, 'base64').equals(PDF)).toBe(true);
    const ev = await eventos(e, { accion: 'recaudo.soporte_consultado', objetoId: p.id });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.actorId).toBe(contadoraId);
  });
});

describe('Requisito: importación desde Excel', () => {
  it('CA-08: previsualiza errores y duplicados; solo crea al confirmar', async () => {
    await registrar({ valor: 910000, referencia: 'IMP-DUP', unidadId: unidad1 });
    const hoja = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Unidad', 'Valor', 'Medio', 'Referencia', 'Pagador'],
      ['12/11/2026', '102-1', '$ 920.000', 'Transferencia', 'IMP-OK', 'Pagador ejemplo B'],
      ['2026-11-12', '101-1', 'no es valor', 'Efectivo', 'IMP-MALA', ''],
      ['2026-11-12', '999-9', 930000, 'Consignación', 'IMP-UNIDAD', ''],
      ['2026-11-12', '101-1', 910000, 'Transferencia', 'IMP-DUP', ''],
      ['2026-11-12', '', 940000, 'Transferencia', 'IMP-SINUNIDAD', ''],
    ]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Pagos');
    const archivo = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const c = cliente(asistente, A);
    const antes = await e.owner.recaudo.count({ where: { condominioId: A } });

    const leido = await c.subir(
      '/recaudos/importaciones/leer',
      archivo,
      'pagos.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(leido.status).toBe(201);
    expect(leido.body.columnas).toEqual([
      'Fecha',
      'Unidad',
      'Valor',
      'Medio',
      'Referencia',
      'Pagador',
    ]);
    expect(leido.body.filas).toHaveLength(5);

    const vista = await c.post('/recaudos/importaciones/previsualizar', {
      archivo: 'pagos.xlsx',
      filas: leido.body.filas,
      columnas: {
        fechaPago: 'Fecha',
        unidad: 'Unidad',
        valor: 'Valor',
        medio: 'Medio',
        referencia: 'Referencia',
        pagador: 'Pagador',
      },
    });
    expect(vista.status).toBe(201);
    expect(vista.body.resumen).toEqual({
      total: 5,
      validas: 1,
      advertencias: 1,
      duplicados: 1,
      errores: 2,
    });
    const estados = vista.body.filas.map((f: { resultado: string }) => f.resultado);
    expect(estados).toEqual(['VALIDA', 'ERROR', 'ERROR', 'DUPLICADO', 'ADVERTENCIA']);
    expect(vista.body.filas[0].datos).toMatchObject({
      fechaPago: '2026-11-12',
      valor: '920000',
      medio: 'TRANSFERENCIA',
    });
    expect(await e.owner.recaudo.count({ where: { condominioId: A } })).toBe(antes);

    const confirmada = await c.post(`/recaudos/importaciones/${vista.body.id}/confirmar`, {});
    expect(confirmada.status).toBe(200);
    expect(confirmada.body).toEqual({ creados: 2, omitidos: 3 });
    const creados = await e.owner.recaudo.findMany({
      where: { condominioId: A, importacionId: vista.body.id },
      orderBy: { numero: 'asc' },
    });
    expect(creados.map((r) => r.referencia)).toEqual(['IMP-OK', 'IMP-SINUNIDAD']);
    expect(creados.every((r) => r.estado === 'PENDIENTE' && r.origen === 'IMPORTACION')).toBe(true);
    expect(creados[1]!.unidadId).toBeNull();

    const repetida = await c.post(`/recaudos/importaciones/${vista.body.id}/confirmar`, {});
    expect(repetida.status).toBe(404);
    expect(
      await eventos(e, { accion: 'recaudos.importacion_confirmada', objetoId: vista.body.id }),
    ).toHaveLength(1);
  });

  it('rechaza archivos que no son Excel o CSV', async () => {
    const r = await cliente(asistente, A).subir(
      '/recaudos/importaciones/leer',
      PDF,
      'pagos.pdf',
      'application/pdf',
    );
    expect(r.status).toBe(400);
  });
});

describe('Requisito: aislamiento entre condominios', () => {
  it('el condominio B no ve ni modifica pagos del A', async () => {
    const p = await registrar({ valor: 990000, unidadId: unidad1, referencia: 'TRX-SOLO-A' });
    const s = await cliente(asistente, A).subir(
      `/recaudos/${p.id}/soportes`,
      PDF,
      'a.pdf',
      'application/pdf',
    );
    const b = cliente(adminB, B);

    const lista = await b.get('/recaudos');
    expect(lista.status).toBe(200);
    expect(lista.body.items).toEqual([]);
    expect(lista.body.resumen.total).toBe(0);
    expect((await b.get('/recaudos/exportar')).body.items).toEqual([]);

    for (const intento of [
      b.get(`/recaudos/${p.id}`),
      b.get(`/recaudos/${p.id}/soportes/${s.body.id}`),
      b.patch(`/recaudos/${p.id}`, { pagador: 'Intruso' }),
      b.post(`/recaudos/${p.id}/verificar`, { imputaciones: [] }),
      b.post(`/recaudos/${p.id}/observar`, { observacion: 'Intento desde B' }),
      b.post(`/recaudos/${p.id}/anular`, { motivo: 'Intento desde otro condominio' }),
      b.subir(`/recaudos/${p.id}/soportes`, PDF, 'b.pdf', 'application/pdf'),
    ]) {
      expect((await intento).status).toBe(404);
    }
    // Tampoco puede registrar en B un pago apuntando a una unidad de A.
    const cruzado = await b.post('/recaudos', pago({ unidadId: unidad1, valor: 1000 }));
    expect(cruzado.status).toBe(404);
    // La asistente de A no opera en B.
    expect((await cliente(asistente, B).get('/recaudos')).status).toBe(404);

    const intacto = await e.owner.recaudo.findUnique({ where: { id: p.id } });
    expect(intacto).toMatchObject({ estado: 'PENDIENTE', pagador: null });
    // B empieza su propio consecutivo.
    const enB = await b.post('/recaudos', pago({ valor: 1000 }));
    expect(enB.body.numero).toBe(1);
  });
});
