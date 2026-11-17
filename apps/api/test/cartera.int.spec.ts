/**
 * REQ-004 · Gestión de cartera. Cubre CA-01 a CA-10, permisos y aislamiento entre condominios.
 * Datos ficticios. Requiere `pnpm db:up` + migraciones.
 */
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

type S = { token: string };
let e: Entorno;
let A: string;
let B: string;
let contadora: S;
let admin: S;
let asistente: S;
let adminB: S;
let villa: string;
let lote: string;
let sinCuota: string;
let propietario: string;

const cliente = (s: S, c: string) => {
  const con = (r: ReturnType<Entorno['http']['get']>) =>
    r.set(bearer(s.token)).set('x-condominio-id', c);
  return {
    get: (p: string) => con(e.http.get(`/api/v1${p}`)),
    post: (p: string, d: object = {}) => con(e.http.post(`/api/v1${p}`)).send(d),
    subir: (p: string, buffer: Buffer, fechaCorte = '2026-10-31', nombre = 'saldos.xlsx') =>
      con(e.http.post(`/api/v1${p}`))
        .field('fechaCorte', fechaCorte)
        .attach('archivo', buffer, { filename: nombre, contentType: 'application/octet-stream' }),
  };
};
const obligacion = (extra: object = {}) => ({
  unidadId: villa,
  concepto: 'CUOTA_ADMINISTRACION',
  periodo: '2026-09',
  fechaEmision: '2026-09-01',
  fechaVencimiento: '2026-09-10',
  valor: 550000,
  ...extra,
});
async function crear(extra: object = {}) {
  const r = await cliente(contadora, A).post('/cartera/obligaciones', obligacion(extra));
  if (r.status !== 201) throw new Error(`obligación ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body as { id: string; numeroVisible: string };
}
const cuenta = async (unidad: string, corte = '') =>
  (await cliente(contadora, A).get(`/cartera/unidades/${unidad}${corte ? `?corte=${corte}` : ''}`))
    .body;
const libro = (filas: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Saldos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

beforeAll(async () => {
  e = await crearEntorno();
  A = await crearCondominio(e, 'A');
  B = await crearCondominio(e, 'B');
  const mk = async (
    alias: string,
    condominioId: string,
    rol: 'CONTADORA' | 'ADMINISTRADORA' | 'ASISTENTE',
  ) =>
    iniciarSesion(
      e,
      await crearUsuario(e, alias, { roles: [{ condominioId, rol }], mfa: rol !== 'ASISTENTE' }),
    );
  contadora = await mk('cart-contadora', A, 'CONTADORA');
  admin = await mk('cart-admin', A, 'ADMINISTRADORA');
  asistente = await mk('cart-asistente', A, 'ASISTENTE');
  adminB = await mk('cart-adminb', B, 'ADMINISTRADORA');
  const unidad = async (codigo: string, tipo: 'VILLA' | 'LOTE', cuotaMensual?: number) =>
    (await e.owner.unidadPrivada.create({ data: { condominioId: A, codigo, tipo, cuotaMensual } }))
      .id;
  villa = await unidad('Villa 01', 'VILLA', 550000);
  lote = await unidad('Lote 03', 'LOTE', 420000);
  sinCuota = await unidad('Lote 09', 'LOTE');
  propietario = (
    await e.owner.propietario.create({
      data: { condominioId: A, nombre: 'Persona Ficticia Cartera' },
    })
  ).id;
  await e.owner.titularidad.create({
    data: { condominioId: A, propietarioId: propietario, unidadId: villa, tipo: 'TITULAR' },
  });
});
afterAll(() => e.cerrar());

describe('Obligaciones y saldo por unidad', () => {
  it('CA-01: muestra el detalle y el saldo correcto de la unidad', async () => {
    const o1 = await crear();
    await crear({ periodo: '2026-10', fechaEmision: '2026-10-01', fechaVencimiento: '2026-10-10' });
    expect(o1.numeroVisible).toBe('OBL-00001');
    const c = await cuenta(villa, '2026-10-31');
    expect(c.unidad.codigo).toBe('Villa 01');
    expect(c.propietarios).toEqual([{ id: propietario, nombre: 'Persona Ficticia Cartera' }]);
    expect(c.totales).toMatchObject({
      cargos: '1100000',
      pagos: '0',
      saldo: '1100000',
      vencido: '1100000',
    });
    expect(c.obligaciones).toHaveLength(2);
    expect(c.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(['CARGO', 'CARGO']);
    expect(c.movimientos.at(-1).saldo).toBe('1100000');
    expect(await eventos(e, { accion: 'cartera.obligacion_creada', objetoId: o1.id })).toHaveLength(
      1,
    );
  });

  it('no duplica una obligación del mismo concepto y periodo (RN-02)', async () => {
    const r = await cliente(contadora, A).post('/cartera/obligaciones', obligacion());
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('OBL-00001');
  });

  it.each([
    ['valor cero', { valor: 0 }],
    ['valor con texto', { valor: 'mucho' }],
    ['vencimiento antes de la emisión', { fechaVencimiento: '2026-08-01' }],
    ['periodo inválido', { periodo: '2026-13' }],
    ['campo desconocido', { saldo: 1 }],
  ])('rechaza %s', async (_n, extra) => {
    const r = await cliente(contadora, A).post(
      '/cartera/obligaciones',
      obligacion({ periodo: '2026-01', ...extra }),
    );
    expect(r.status).toBe(400);
  });

  it('CA-05: clasifica la mora según la fecha de corte', async () => {
    const tramoA = async (corte: string) => {
      const r = await cliente(contadora, A).get(
        `/cartera/obligaciones?periodoDesde=2026-09&periodoHasta=2026-09&corte=${corte}`,
      );
      return r.body.obligaciones.map((o: { tramo: string; diasMora: number; vencida: boolean }) => [
        o.tramo,
        o.diasMora,
        o.vencida,
      ]);
    };
    expect(await tramoA('2026-09-10')).toEqual([['CORRIENTE', 0, false]]);
    expect(await tramoA('2026-09-11')).toEqual([['01_30', 1, true]]);
    expect(await tramoA('2026-10-10')).toEqual([['01_30', 30, true]]);
    expect(await tramoA('2026-10-11')).toEqual([['31_60', 31, true]]);
    expect(await tramoA('2026-11-10')).toEqual([['61_90', 61, true]]);
    // Antes de emitirse la obligación no existe en ese corte (histórico por corte, RN-10).
    expect(await tramoA('2026-08-31')).toEqual([]);
    expect((await cliente(contadora, A).get('/cartera?corte=2099-01-01')).status).toBe(400);

    const general = await cliente(contadora, A).get('/cartera?corte=2026-10-31');
    expect(general.body.corte).toBe('2026-10-31');
    expect(general.body.resumen).toMatchObject({
      total: '1100000',
      vencido: '1100000',
      unidadesConSaldo: 1,
    });
    expect(general.body.resumen.porTramo).toMatchObject({
      CORRIENTE: '0',
      '01_30': '550000',
      '31_60': '550000',
    });
    const fila = general.body.unidades[0];
    expect(fila).toMatchObject({
      estado: 'VENCIDA',
      periodoMasAntiguo: '2026-09',
      diasMora: 51,
      obligacionesAbiertas: 2,
    });
  });
});

describe('Integración con pagos verificados (REQ-003)', () => {
  let pagoId: string;
  it('CA-02: un pago pendiente no cambia el saldo', async () => {
    const p = await cliente(contadora, A).post('/recaudos', {
      unidadId: villa,
      fechaPago: '2026-10-18',
      valor: 500000,
      medio: 'TRANSFERENCIA',
    });
    expect(p.status).toBe(201);
    pagoId = p.body.id;
    const c = await cuenta(villa);
    expect(c.totales.saldo).toBe('1100000');
    expect(c.recaudosSinVerificar).toEqual([
      expect.objectContaining({ id: pagoId, estado: 'PENDIENTE', valor: '500000' }),
    ]);
  });

  it('CA-03 y CA-06: al verificar baja exactamente lo imputado y la obligación sigue abierta', async () => {
    const excede = await cliente(contadora, A).post(`/recaudos/${pagoId}/verificar`, {
      imputaciones: [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-10', valorAplicado: 500000 },
        { concepto: 'INTERESES', periodo: '2026-10', valorAplicado: 1 },
      ],
    });
    expect(excede.status).toBe(400);
    const v = await cliente(contadora, A).post(`/recaudos/${pagoId}/verificar`, {
      imputaciones: [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-10',
          valorObligacion: 550000,
          valorAplicado: 400000,
        },
      ],
    });
    expect(v.status).toBe(200);
    expect(v.body.saldoAFavor).toBe('100000');

    const c = await cuenta(villa);
    expect(c.totales).toMatchObject({ pagos: '400000', saldo: '700000', saldoAFavor: '100000' });
    expect(c.recaudosSinVerificar).toEqual([]);
    const octubre = c.obligaciones.find((o: { periodo: string }) => o.periodo === '2026-10');
    expect(octubre).toMatchObject({
      estado: 'PARCIAL',
      saldo: '150000',
      pagos: '400000',
      vencida: true,
    });
    const pago = c.movimientos.find((m: { tipo: string }) => m.tipo === 'PAGO');
    expect(pago).toMatchObject({ abono: '400000', recaudo: 'RC-0001', fecha: '2026-10-18' });
    // El corte anterior al pago conserva el saldo de ese día.
    expect((await cuenta(villa, '2026-10-17')).totales.saldo).toBe('1100000');
    // Una sola aplicación por imputación (HU-04).
    expect(
      await e.owner.movimientoCartera.count({ where: { recaudoId: pagoId, tipo: 'PAGO' } }),
    ).toBe(1);
  });

  it('no permite aplicar más que el saldo real de la obligación', async () => {
    const p = await cliente(contadora, A).post('/recaudos', {
      unidadId: villa,
      fechaPago: '2026-10-20',
      valor: 300000,
      medio: 'EFECTIVO',
    });
    const v = await cliente(contadora, A).post(`/recaudos/${p.body.id}/verificar`, {
      imputaciones: [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-10', valorAplicado: 300000 },
      ],
    });
    expect(v.status).toBe(409);
    expect((await cuenta(villa)).totales.saldo).toBe('700000');
    await cliente(contadora, A).post(`/recaudos/${p.body.id}/anular`, {
      motivo: 'Pago de prueba que no corresponde',
    });
  });

  it('CA-04: la anulación restituye el saldo y deja trazabilidad', async () => {
    const r = await cliente(contadora, A).post(`/recaudos/${pagoId}/anular`, {
      motivo: 'Consignación devuelta por el banco',
    });
    expect(r.status).toBe(200);
    const c = await cuenta(villa);
    expect(c.totales).toMatchObject({ pagos: '0', saldo: '1100000', saldoAFavor: '0' });
    expect(c.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual([
      'CARGO',
      'CARGO',
      'PAGO',
      'REVERSO_PAGO',
    ]);
    const reverso = c.movimientos.at(-1);
    expect(reverso).toMatchObject({ cargo: '400000', recaudo: 'RC-0001', saldo: '1100000' });
    expect(reverso.descripcion).toContain('Consignación devuelta');
    expect(c.obligaciones.find((o: { periodo: string }) => o.periodo === '2026-10').estado).toBe(
      'PENDIENTE',
    );
  });
});

describe('Gestiones y compromisos', () => {
  it('CA-07: registra gestión con compromiso sin modificar la deuda', async () => {
    const antes = (await cuenta(villa)).totales.saldo;
    const g = await cliente(asistente, A).post('/cartera/gestiones', {
      unidadId: villa,
      fecha: '2026-11-10',
      canal: 'TELEFONO',
      contacto: 'Contacto ficticio',
      resultado: 'Acepta pagar la cuota de septiembre',
      proximaFecha: '2026-11-20',
      compromiso: {
        fechaPactada: '2026-11-20',
        valor: '550.000',
        observaciones: 'Pago por transferencia',
      },
    });
    expect(g.status).toBe(201);
    expect(g.body.compromiso).toMatchObject({
      estado: 'ABIERTO',
      valor: '550000',
      fechaPactada: '2026-11-20',
    });
    const c = await cuenta(villa);
    expect(c.totales.saldo).toBe(antes);
    expect(c.gestiones[0]).toMatchObject({
      canal: 'TELEFONO',
      proximaFecha: '2026-11-20',
      responsable: 'cart-asistente',
    });
    expect(c.compromisos).toHaveLength(1);

    const general = await cliente(contadora, A).get('/cartera');
    expect(general.body.resumen.compromisosAbiertos).toBe(1);
    expect(
      general.body.unidades.find((u: { unidad: { id: string } }) => u.unidad.id === villa),
    ).toMatchObject({
      compromisosAbiertos: 1,
      ultimaGestion: '2026-11-10',
    });
    expect((await cliente(asistente, A).get('/cartera/gestiones')).body).toHaveLength(1);
    expect(
      (await cliente(asistente, A).get('/cartera/compromisos?estado=ABIERTO')).body[0],
    ).toMatchObject({ estado: 'ABIERTO' });

    const id = g.body.compromiso.id;
    const cierre = await cliente(asistente, A).post(`/cartera/compromisos/${id}/estado`, {
      estado: 'INCUMPLIDO',
      observaciones: 'No pagó en la fecha',
    });
    expect(cierre.status).toBe(200);
    expect(
      (
        await cliente(asistente, A).post(`/cartera/compromisos/${id}/estado`, {
          estado: 'CUMPLIDO',
        })
      ).status,
    ).toBe(409);
    expect((await cuenta(villa)).totales.saldo).toBe(antes);
    expect(
      await eventos(e, { accion: 'cartera.compromiso_actualizado', objetoId: id }),
    ).toHaveLength(1);
  });

  it('rechaza gestiones sin resultado o con fecha futura', async () => {
    const base = {
      unidadId: villa,
      fecha: '2026-11-10',
      canal: 'CORREO',
      resultado: 'Se envió recordatorio',
    };
    const c = cliente(asistente, A);
    expect((await c.post('/cartera/gestiones', { ...base, resultado: ' ' })).status).toBe(400);
    expect((await c.post('/cartera/gestiones', { ...base, fecha: '2099-01-01' })).status).toBe(400);
    expect((await c.post('/cartera/gestiones', { ...base, canal: 'SEÑALES' })).status).toBe(400);
  });
});

describe('Ajustes con autorización', () => {
  it('exige motivo, otra persona que autorice y conserva la obligación original', async () => {
    const o = await crear({
      unidadId: lote,
      periodo: '2026-10',
      fechaEmision: '2026-10-01',
      fechaVencimiento: '2026-10-10',
      valor: 420000,
    });
    const c = cliente(contadora, A);
    expect(
      (
        await c.post('/cartera/ajustes', {
          obligacionId: o.id,
          tipo: 'CREDITO',
          valor: 20000,
          motivo: 'corto',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post('/cartera/ajustes', {
          obligacionId: o.id,
          tipo: 'CREDITO',
          valor: 500000,
          motivo: 'Supera el saldo de la obligación',
        })
      ).status,
    ).toBe(400);
    const a = await c.post('/cartera/ajustes', {
      obligacionId: o.id,
      tipo: 'CREDITO',
      valor: 20000,
      motivo: 'Descuento aprobado por el consejo',
      soporte: 'Acta ficticia 12',
    });
    expect(a.status).toBe(201);
    // Solicitado no es aplicado.
    expect((await cuenta(lote)).totales.saldo).toBe('420000');
    expect((await c.get('/cartera/ajustes?estado=PENDIENTE')).body[0]).toMatchObject({
      id: a.body.id,
      esPropio: true,
      unidad: { codigo: 'Lote 03' },
    });

    const propio = await c.post(`/cartera/ajustes/${a.body.id}/resolver`, {
      aprobar: true,
      nota: 'Me lo apruebo',
    });
    expect(propio.status).toBe(403);
    const ok = await cliente(admin, A).post(`/cartera/ajustes/${a.body.id}/resolver`, {
      aprobar: true,
      nota: 'Conforme con el acta',
    });
    expect(ok.status).toBe(200);
    expect(
      (
        await cliente(admin, A).post(`/cartera/ajustes/${a.body.id}/resolver`, {
          aprobar: false,
          nota: 'Otra vez',
        })
      ).status,
    ).toBe(409);

    const d = await c.get(`/cartera/obligaciones/${o.id}`);
    expect(d.body).toMatchObject({
      valor: '420000',
      saldo: '400000',
      creditos: '20000',
      estado: 'PARCIAL',
    });
    expect(d.body.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual([
      'CARGO',
      'AJUSTE_CREDITO',
    ]);
    expect(d.body.ajustes[0]).toMatchObject({
      estado: 'APROBADO',
      solicitadoPorNombre: 'cart-contadora',
      resueltoPorNombre: 'cart-admin',
    });
    expect(d.body.historial.map((h: { accion: string }) => h.accion)).toEqual([
      'cartera.obligacion_creada',
      'cartera.ajuste_solicitado',
      'cartera.ajuste_aprobado',
    ]);
    expect((await e.owner.obligacion.findUnique({ where: { id: o.id } }))!.valor.toString()).toBe(
      '420000',
    );

    const rechazado = await c.post('/cartera/ajustes', {
      obligacionId: o.id,
      tipo: 'DEBITO',
      valor: 5000,
      motivo: 'Cargo por gestión de cobro',
    });
    await cliente(admin, A).post(`/cartera/ajustes/${rechazado.body.id}/resolver`, {
      aprobar: false,
      nota: 'No está aprobado en reglamento',
    });
    expect((await cuenta(lote)).totales.saldo).toBe('400000');
  });
});

describe('Generación de cuotas del periodo', () => {
  it('crea una cuota por unidad activa con cuota definida y no repite', async () => {
    const d = { periodo: '2026-11', fechaEmision: '2026-11-01', fechaVencimiento: '2026-11-10' };
    const r = await cliente(admin, A).post('/cartera/obligaciones/generar', d);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ creadas: 2, valor: '970000', yaExistian: 0, sinCuota: 1 });
    expect((await cliente(admin, A).post('/cartera/obligaciones/generar', d)).status).toBe(409);
    expect((await cuenta(sinCuota)).obligaciones).toEqual([]);
    expect(
      await eventos(e, { accion: 'cartera.obligaciones_generadas', condominioId: A }),
    ).toHaveLength(1);
  });
});

describe('Importación de saldos iniciales', () => {
  it('CA-08: identifica filas y motivos antes de importar; solo crea al aprobar', async () => {
    const archivo = libro([
      ['Unidad', 'Periodo', 'Vencimiento', 'Saldo', 'Descripción'],
      ['Lote 09', '2026-08', '10/08/2026', '$ 300.000', 'Saldo de apertura'],
      ['Villa 01', '2026-07', '10/07/2026', 120000, ''],
      ['Villa 99', '2026-08', '10/08/2026', 100000, ''],
      ['Lote 09', '2026-08', '10/08/2026', 300000, 'Repetida'],
      ['Lote 09', 'agosto', '10/08/2026', 'cero', ''],
    ]);
    const antes = await e.owner.obligacion.count({ where: { condominioId: A } });
    expect(
      (await cliente(asistente, A).subir('/cartera/importaciones/previsualizar', archivo)).status,
    ).toBe(403);
    const v = await cliente(contadora, A).subir('/cartera/importaciones/previsualizar', archivo);
    expect(v.status).toBe(201);
    expect(v.body.resumen).toEqual({
      total: 5,
      validas: 1,
      advertencias: 1,
      duplicados: 1,
      errores: 2,
      valor: '420000',
    });
    expect(v.body.filas.map((f: { resultado: string }) => f.resultado)).toEqual([
      'VALIDA',
      'ADVERTENCIA',
      'ERROR',
      'DUPLICADO',
      'ERROR',
    ]);
    expect(v.body.filas[2].mensajes).toEqual(['La unidad Villa 99 no existe']);
    expect(v.body.filas[4].mensajes).toHaveLength(2);
    expect(v.body.filas[0]).toMatchObject({
      valor: '300000',
      fechaVencimiento: '2026-08-10',
      periodo: '2026-08',
    });
    expect(await e.owner.obligacion.count({ where: { condominioId: A } })).toBe(antes);

    const a = await cliente(contadora, A).post(`/cartera/importaciones/${v.body.id}/aprobar`);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ creadas: 2, omitidas: 3, valor: '420000' });
    expect(
      (await cliente(contadora, A).post(`/cartera/importaciones/${v.body.id}/aprobar`)).status,
    ).toBe(404);
    const c = await cuenta(sinCuota);
    expect(c.obligaciones[0]).toMatchObject({
      concepto: 'SALDO_INICIAL',
      origen: 'IMPORTACION',
      saldo: '300000',
      vencida: true,
    });

    // Importar de nuevo el mismo archivo no duplica la deuda.
    const otra = await cliente(contadora, A).subir('/cartera/importaciones/previsualizar', archivo);
    expect(otra.body.resumen).toMatchObject({ validas: 0, advertencias: 0, duplicados: 3 });
    expect(
      (await cliente(contadora, A).post(`/cartera/importaciones/${otra.body.id}/aprobar`)).status,
    ).toBe(409);
  });

  it('un saldo inicial se paga con un recaudo verificado', async () => {
    const p = await cliente(contadora, A).post('/recaudos', {
      unidadId: sinCuota,
      fechaPago: '2026-11-05',
      valor: 300000,
      medio: 'CONSIGNACION',
    });
    const v = await cliente(contadora, A).post(`/recaudos/${p.body.id}/verificar`, {
      imputaciones: [{ concepto: 'SALDO_INICIAL', periodo: '2026-08', valorAplicado: 300000 }],
    });
    expect(v.status).toBe(200);
    expect((await cuenta(sinCuota)).obligaciones[0]).toMatchObject({
      estado: 'PAGADA',
      saldo: '0',
      vencida: false,
    });
  });

  it('rechaza archivos sin las columnas necesarias o de otro tipo', async () => {
    const c = cliente(contadora, A);
    expect(
      (
        await c.subir(
          '/cartera/importaciones/previsualizar',
          libro([
            ['Unidad', 'Nota'],
            ['Villa 01', 'x'],
          ]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await c.subir(
          '/cartera/importaciones/previsualizar',
          Buffer.from('%PDF-1.4'),
          '2026-10-31',
          'saldos.pdf',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await c.subir(
          '/cartera/importaciones/previsualizar',
          libro([
            ['Unidad', 'Periodo', 'Valor'],
            ['Villa 01', '2026-01', 1],
          ]),
          '2099-01-01',
        )
      ).status,
    ).toBe(400);
  });
});

describe('Filtros y reportes', () => {
  it('filtra por propietario, unidad, periodo, estado y rango de deuda', async () => {
    const c = cliente(contadora, A);
    const codigos = async (q: string) =>
      (await c.get(`/cartera?${q}`)).body.unidades.map(
        (u: { unidad: { codigo: string } }) => u.unidad.codigo,
      );
    expect(await codigos(`propietarioId=${propietario}`)).toEqual(['Villa 01']);
    expect(await codigos('buscar=ficticia')).toEqual(['Villa 01']);
    expect(await codigos('buscar=lote')).toEqual(['Lote 03', 'Lote 09']);
    expect(await codigos(`unidadId=${lote}`)).toEqual(['Lote 03']);
    expect(await codigos('estado=AL_DIA')).toEqual(['Lote 09']);
    expect(await codigos('estado=VENCIDA')).toEqual(['Villa 01', 'Lote 03']);
    expect(await codigos('minimo=1000000')).toEqual(['Villa 01']);
    expect(await codigos('maximo=900000&estado=CON_SALDO')).toEqual(['Lote 03']);
    expect(await codigos('periodoDesde=2026-07&periodoHasta=2026-07')).toEqual(['Villa 01']);

    const numeros = async (q: string) =>
      (await c.get(`/cartera/obligaciones?${q}`)).body.obligaciones.length;
    expect(await numeros('estado=PAGADA')).toBe(1);
    expect(await numeros('estado=PARCIAL')).toBe(1);
    expect(await numeros('concepto=SALDO_INICIAL')).toBe(2);
    expect(await numeros(`unidadId=${villa}&estado=VENCIDA`)).toBeGreaterThanOrEqual(3);
    expect((await c.get('/cartera?estado=RARO')).status).toBe(400);
  });

  it('CA-10: el reporte exportado coincide con el listado y la fecha de corte', async () => {
    const c = cliente(contadora, A);
    const q = 'corte=2026-10-31&estado=CON_SALDO';
    const listado = await c.get(`/cartera?${q}`);
    const r = await c
      .get(`/cartera/reportes/general?formato=xlsx&${q}`)
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (d: Buffer) => partes.push(d));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('cartera-general-2026-10-31.xlsx');
    const hoja = XLSX.read(r.body as Buffer, { type: 'buffer' }).Sheets.Reporte!;
    const filas = XLSX.utils.sheet_to_json<(string | number)[]>(hoja, { header: 1 });
    expect(String(filas[2]![0])).toContain('Fecha de corte: 31/10/2026');
    const inicio = filas.findIndex((f) => f[0] === 'Unidad');
    const datos = filas.slice(inicio + 1, -1);
    expect(datos.map((f) => [f[0], f[2]])).toEqual(
      listado.body.unidades.map(
        (u: { unidad: { tipo: string; codigo: string }; saldo: string }) => [
          `${u.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} ${u.unidad.codigo}`,
          Number(u.saldo),
        ],
      ),
    );
    expect(filas.at(-1)![2]).toBe(Number(listado.body.resumen.total));

    for (const tipo of ['general', 'vencida', 'gestiones', `estado-cuenta`]) {
      const pdf = await c
        .get(`/cartera/reportes/${tipo}?formato=pdf&unidadId=${villa}`)
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (d: Buffer) => partes.push(d));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect((await c.get('/cartera/reportes/estado-cuenta?formato=pdf')).status).toBe(400);
    expect((await c.get('/cartera/reportes/otro?formato=pdf')).status).toBe(400);
    const ev = await eventos(e, { accion: 'cartera.reporte_exportado', condominioId: A });
    expect(ev[0]!.despues).toMatchObject({ tipo: 'general', formato: 'xlsx', corte: '2026-10-31' });
  });
});

describe('Permisos y aislamiento', () => {
  it('HU-03: la asistente consulta y registra gestiones, pero no toca valores ni exporta', async () => {
    const c = cliente(asistente, A);
    const o = (await cliente(contadora, A).get(`/cartera/obligaciones?unidadId=${lote}`)).body
      .obligaciones[0];
    expect((await c.get('/cartera')).status).toBe(200);
    expect((await c.get(`/cartera/unidades/${villa}`)).status).toBe(200);
    for (const intento of [
      c.post('/cartera/obligaciones', obligacion({ periodo: '2026-02' })),
      c.post('/cartera/obligaciones/generar', {
        periodo: '2026-12',
        fechaEmision: '2026-11-15',
        fechaVencimiento: '2026-12-10',
      }),
      c.post('/cartera/ajustes', {
        obligacionId: o.id,
        tipo: 'CREDITO',
        valor: 1000,
        motivo: 'Intento sin autorización',
      }),
      c.post('/cartera/ajustes/99999999-9999-4999-8999-999999999999/resolver', {
        aprobar: true,
        nota: 'Intento',
      }),
      c.post('/cartera/importaciones/99999999-9999-4999-8999-999999999999/aprobar'),
      c.get('/cartera/reportes/general?formato=xlsx'),
    ]) {
      expect((await intento).status).toBe(403);
    }
    expect((await e.http.get('/api/v1/cartera')).status).toBe(401);
  });

  it('CA-09: el condominio B no ve, modifica ni exporta la cartera del A', async () => {
    const b = cliente(adminB, B);
    const o = (await cliente(contadora, A).get(`/cartera/obligaciones?unidadId=${lote}`)).body
      .obligaciones[0];
    const ajuste = (await cliente(contadora, A).get('/cartera/ajustes')).body[0];
    const compromiso = (await cliente(contadora, A).get('/cartera/compromisos')).body[0];
    const lista = await b.get('/cartera');
    expect(lista.body.unidades).toEqual([]);
    expect(lista.body.resumen.total).toBe('0');
    expect((await b.get('/cartera/obligaciones')).body.obligaciones).toEqual([]);
    expect((await b.get('/cartera/gestiones')).body).toEqual([]);
    expect((await b.get('/cartera/compromisos')).body).toEqual([]);
    expect((await b.get('/cartera/ajustes')).body).toEqual([]);
    for (const intento of [
      b.get(`/cartera/unidades/${villa}`),
      b.get(`/cartera/obligaciones/${o.id}`),
      b.get(`/cartera/reportes/estado-cuenta?formato=pdf&unidadId=${villa}`),
      b.post('/cartera/obligaciones', obligacion({ periodo: '2026-03' })),
      b.post('/cartera/gestiones', {
        unidadId: villa,
        fecha: '2026-11-10',
        canal: 'CORREO',
        resultado: 'Intento desde B',
      }),
      b.post('/cartera/compromisos', { unidadId: villa, fechaPactada: '2026-12-01', valor: 1000 }),
      b.post(`/cartera/compromisos/${compromiso.id}/estado`, { estado: 'CANCELADO' }),
      b.post('/cartera/ajustes', {
        obligacionId: o.id,
        tipo: 'CREDITO',
        valor: 1000,
        motivo: 'Intento desde otro condominio',
      }),
      b.post(`/cartera/ajustes/${ajuste.id}/resolver`, { aprobar: true, nota: 'Intento desde B' }),
    ]) {
      expect((await intento).status).toBe(404);
    }
    expect((await cliente(asistente, B).get('/cartera')).status).toBe(404);
  });

  it('el rol de aplicación no puede borrar ni alterar el libro de cartera', async () => {
    const app = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      await expect(app.$executeRaw`DELETE FROM obligacion`).rejects.toThrow();
      await expect(app.$executeRaw`UPDATE obligacion SET valor = 1`).rejects.toThrow();
      await expect(app.$executeRaw`UPDATE movimiento_cartera SET valor = 1`).rejects.toThrow();
      await expect(app.$executeRaw`DELETE FROM movimiento_cartera`).rejects.toThrow();
      await expect(app.$executeRaw`DELETE FROM gestion_cobro`).rejects.toThrow();
    } finally {
      await app.$disconnect();
    }
  });
});
