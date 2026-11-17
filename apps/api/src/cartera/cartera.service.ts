import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ConceptoImputacion, type TipoMovimientoCartera } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuditoriaService, type EventoAuditoria } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import {
  hoyEnBogota,
  numeroVisible,
  parsearFecha,
  parsearValor,
} from '../recaudos/recaudos.reglas';
import type {
  CambiarCompromiso,
  ConsultaReporte,
  CrearAjuste,
  CrearCompromiso,
  CrearGestion,
  CrearObligacion,
  FiltrosCartera,
  FiltrosCompromisos,
  FiltrosGestiones,
  FiltrosObligaciones,
  GenerarObligaciones,
  ResolverAjuste,
  TipoReporte,
} from './cartera.dto';
import { TRAMOS, calcularSaldo, numeroObligacion, signoDe, type Tramo } from './cartera.reglas';
import type { Reporte } from './cartera.reportes';

type Tx = Prisma.TransactionClient;
type D = Prisma.Decimal;
export type ArchivoCargado = { originalname: string; buffer: Buffer };

export type ResultadoFila = 'VALIDA' | 'ADVERTENCIA' | 'DUPLICADO' | 'ERROR';
export interface FilaSaldo {
  fila: number;
  resultado: ResultadoFila;
  mensajes: string[];
  unidad: string;
  unidadId: string | null;
  periodo: string | null;
  fechaVencimiento: string | null;
  valor: string | null;
  descripcion: string | null;
}

const CERO = new Prisma.Decimal(0);
const ctx = () => {
  const c = contexto.actual();
  if (!c.condominioId || !c.usuarioId)
    throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId: c.condominioId, usuarioId: c.usuarioId };
};
const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (f: Date) => f.toISOString().slice(0, 10);
const limpio = (v?: string | null) => v?.trim().replace(/\s+/g, ' ') || null;
const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sumar = <T>(lista: readonly T[], de: (x: T) => D) =>
  lista.reduce((s, x) => s.plus(de(x)), CERO);

const NOMBRE_CONCEPTO: Record<ConceptoImputacion, string> = {
  CUOTA_ADMINISTRACION: 'Cuota de administración',
  CUOTA_VENCIDA: 'Cuota vencida',
  INTERESES: 'Intereses de mora',
  CUOTA_EXTRAORDINARIA: 'Cuota extraordinaria',
  OTRO: 'Otro concepto',
  SALDO_INICIAL: 'Saldo inicial',
};
const NOMBRE_MOVIMIENTO: Record<TipoMovimientoCartera, string> = {
  CARGO: 'Cargo',
  PAGO: 'Pago verificado',
  REVERSO_PAGO: 'Reverso de pago',
  AJUSTE_DEBITO: 'Ajuste débito',
  AJUSTE_CREDITO: 'Ajuste crédito',
  CREDITO_APLICADO: 'Crédito aplicado',
};
const NOMBRE_TRAMO: Record<Tramo, string> = {
  CORRIENTE: 'Corriente',
  '01_30': '1–30 días',
  '31_60': '31–60 días',
  '61_90': '61–90 días',
  MAS_90: 'Más de 90 días',
};
const NOMBRE_CANAL: Record<string, string> = {
  TELEFONO: 'Teléfono',
  CORREO: 'Correo',
  WHATSAPP: 'WhatsApp',
  PRESENCIAL: 'Presencial',
  CARTA: 'Carta',
  OTRO: 'Otro',
};

interface InfoUnidad {
  id: string;
  codigo: string;
  tipo: 'VILLA' | 'LOTE';
  activa: boolean;
  propietarios: { id: string; nombre: string }[];
}

interface FiltrosComunes {
  buscar?: string;
  unidadId?: string;
  propietarioId?: string;
  periodoDesde?: string;
  periodoHasta?: string;
  minimo?: number;
  maximo?: number;
}

@Injectable()
export class CarteraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ───────────────────────── Cálculo ─────────────────────────

  /** Serializa cambios de saldo y consecutivos del condominio dentro de la transacción. */
  private bloquear(tx: Tx, condominioId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cartera:${condominioId}`}, 0))`;
  }

  private async unidades(tx: Tx, condominioId: string, f: FiltrosComunes) {
    const lista = await tx.unidadPrivada.findMany({
      where: { condominioId, ...(f.unidadId ? { id: f.unidadId } : {}) },
      select: {
        id: true,
        codigo: true,
        tipo: true,
        activa: true,
        titularidades: {
          where: { hasta: null },
          select: { propietario: { select: { id: true, nombre: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { codigo: 'asc' },
    });
    const buscar = f.buscar ? sinTildes(f.buscar) : '';
    const info: InfoUnidad[] = lista.map((u) => ({
      id: u.id,
      codigo: u.codigo,
      tipo: u.tipo,
      activa: u.activa,
      propietarios: u.titularidades.map((t) => t.propietario),
    }));
    return info.filter(
      (u) =>
        (!f.propietarioId || u.propietarios.some((p) => p.id === f.propietarioId)) &&
        (!buscar ||
          sinTildes(u.codigo).includes(buscar) ||
          u.propietarios.some((p) => sinTildes(p.nombre).includes(buscar))),
    );
  }

  /** Obligaciones emitidas hasta el corte, con su saldo según los movimientos hasta ese día. */
  private async obligacionesAlCorte(
    tx: Tx,
    condominioId: string,
    corte: string,
    f: FiltrosComunes & { concepto?: ConceptoImputacion },
    unidades: Map<string, InfoUnidad>,
  ) {
    const limite = aFecha(corte);
    const filas = await tx.obligacion.findMany({
      where: {
        condominioId,
        fechaEmision: { lte: limite },
        unidadId: { in: [...unidades.keys()] },
        ...(f.concepto ? { concepto: f.concepto } : {}),
        ...(f.periodoDesde || f.periodoHasta
          ? {
              periodo: {
                ...(f.periodoDesde ? { gte: f.periodoDesde } : {}),
                ...(f.periodoHasta ? { lte: f.periodoHasta } : {}),
              },
            }
          : {}),
      },
      include: {
        movimientos: { where: { fecha: { lte: limite } }, select: { tipo: true, valor: true } },
      },
      orderBy: [{ fechaVencimiento: 'asc' }, { numero: 'asc' }],
    });
    return filas.map((o) => {
      const s = calcularSaldo(o.movimientos, dia(o.fechaVencimiento), corte);
      const u = unidades.get(o.unidadId)!;
      return {
        id: o.id,
        numero: o.numero,
        numeroVisible: numeroObligacion(o.numero),
        unidadId: o.unidadId,
        unidad: { id: u.id, codigo: u.codigo, tipo: u.tipo },
        propietarios: u.propietarios,
        concepto: o.concepto,
        periodo: o.periodo,
        descripcion: o.descripcion,
        origen: o.origen,
        fechaEmision: dia(o.fechaEmision),
        fechaVencimiento: dia(o.fechaVencimiento),
        valor: o.valor,
        ...s,
      };
    });
  }

  private async saldosAFavor(tx: Tx, condominioId: string, corte: string) {
    const grupos = await tx.recaudo.groupBy({
      by: ['unidadId'],
      where: {
        condominioId,
        estado: 'VERIFICADO',
        unidadId: { not: null },
        fechaPago: { lte: aFecha(corte) },
      },
      _sum: { saldoAFavor: true },
    });
    return new Map(grupos.map((g) => [g.unidadId!, g._sum.saldoAFavor ?? CERO]));
  }

  private porTramo(obligaciones: { tramo: Tramo; saldo: D }[]) {
    return Object.fromEntries(
      TRAMOS.map((t) => [
        t,
        sumar(
          obligaciones.filter((o) => o.tramo === t && o.saldo.gt(0)),
          (o) => o.saldo,
        ),
      ]),
    ) as Record<Tramo, D>;
  }

  private async carteraPorUnidad(tx: Tx, condominioId: string, f: FiltrosCartera) {
    const corte = f.corte ?? hoyEnBogota();
    const unidades = await this.unidades(tx, condominioId, f);
    const mapa = new Map(unidades.map((u) => [u.id, u]));
    const [obligaciones, aFavor, compromisos, gestiones] = await Promise.all([
      this.obligacionesAlCorte(tx, condominioId, corte, f, mapa),
      this.saldosAFavor(tx, condominioId, corte),
      tx.compromisoPago.groupBy({
        by: ['unidadId'],
        where: { condominioId, estado: 'ABIERTO' },
        _count: { _all: true },
      }),
      tx.gestionCobro.groupBy({
        by: ['unidadId'],
        where: { condominioId },
        _max: { fecha: true, proximaFecha: true },
      }),
    ]);
    const filas = unidades
      .map((u) => {
        const propias = obligaciones.filter((o) => o.unidadId === u.id);
        const abiertas = propias.filter((o) => o.saldo.gt(0));
        const saldo = sumar(abiertas, (o) => o.saldo);
        const vencido = sumar(
          abiertas.filter((o) => o.vencida),
          (o) => o.saldo,
        );
        const peor = abiertas.reduce((m, o) => Math.max(m, o.diasMora), 0);
        const g = gestiones.find((x) => x.unidadId === u.id);
        return {
          unidad: { id: u.id, codigo: u.codigo, tipo: u.tipo },
          propietarios: u.propietarios,
          saldo,
          vencido,
          corriente: saldo.minus(vencido),
          porTramo: this.porTramo(abiertas),
          saldoAFavor: aFavor.get(u.id) ?? CERO,
          obligacionesAbiertas: abiertas.length,
          periodoMasAntiguo: abiertas.map((o) => o.periodo).sort()[0] ?? null,
          diasMora: peor,
          estado: saldo.lte(0)
            ? ('AL_DIA' as const)
            : vencido.gt(0)
              ? ('VENCIDA' as const)
              : ('CORRIENTE' as const),
          compromisosAbiertos: compromisos.find((c) => c.unidadId === u.id)?._count._all ?? 0,
          ultimaGestion: g?._max.fecha ? dia(g._max.fecha) : null,
          proximaGestion: g?._max.proximaFecha ? dia(g._max.proximaFecha) : null,
          tieneObligaciones: propias.length > 0,
        };
      })
      .filter(
        (u) =>
          (!f.estado || (f.estado === 'CON_SALDO' ? u.saldo.gt(0) : u.estado === f.estado)) &&
          (f.minimo === undefined || u.saldo.gte(f.minimo)) &&
          (f.maximo === undefined || u.saldo.lte(f.maximo)) &&
          // Con filtro de periodo solo interesan las unidades con obligaciones en ese rango.
          ((!f.periodoDesde && !f.periodoHasta) || u.tieneObligaciones),
      )
      .sort(
        (a, b) =>
          b.vencido.comparedTo(a.vencido) ||
          b.saldo.comparedTo(a.saldo) ||
          a.unidad.codigo.localeCompare(b.unidad.codigo),
      );
    const visibles = new Set(filas.map((u) => u.unidad.id));
    const abiertas = obligaciones.filter((o) => visibles.has(o.unidadId) && o.saldo.gt(0));
    return {
      corte,
      resumen: {
        total: sumar(filas, (u) => u.saldo),
        vencido: sumar(filas, (u) => u.vencido),
        corriente: sumar(filas, (u) => u.corriente),
        saldoAFavor: sumar(filas, (u) => u.saldoAFavor),
        unidades: filas.length,
        unidadesConSaldo: filas.filter((u) => u.saldo.gt(0)).length,
        unidadesVencidas: filas.filter((u) => u.vencido.gt(0)).length,
        obligacionesAbiertas: abiertas.length,
        compromisosAbiertos: filas.reduce((n, u) => n + u.compromisosAbiertos, 0),
        porTramo: this.porTramo(abiertas),
      },
      unidades: filas,
    };
  }

  private async obligacionesFiltradas(tx: Tx, condominioId: string, f: FiltrosObligaciones) {
    const corte = f.corte ?? hoyEnBogota();
    const unidades = await this.unidades(tx, condominioId, f);
    const todas = await this.obligacionesAlCorte(
      tx,
      condominioId,
      corte,
      f,
      new Map(unidades.map((u) => [u.id, u])),
    );
    const obligaciones = todas.filter(
      (o) =>
        (!f.estado || (f.estado === 'VENCIDA' ? o.vencida : o.estado === f.estado)) &&
        (f.minimo === undefined || o.saldo.gte(f.minimo)) &&
        (f.maximo === undefined || o.saldo.lte(f.maximo)),
    );
    return {
      corte,
      resumen: {
        obligaciones: obligaciones.length,
        valor: sumar(obligaciones, (o) => o.valor),
        total: sumar(obligaciones, (o) => o.saldo),
        vencido: sumar(
          obligaciones.filter((o) => o.vencida),
          (o) => o.saldo,
        ),
        porTramo: this.porTramo(obligaciones),
      },
      obligaciones,
    };
  }

  // ───────────────────────── Consultas ─────────────────────────

  async listar(f: FiltrosCartera) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, (tx) => this.carteraPorUnidad(tx, condominioId, f));
  }

  async listarObligaciones(f: FiltrosObligaciones) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, (tx) =>
      this.obligacionesFiltradas(tx, condominioId, f),
    );
  }

  private async nombres(tx: Tx, ids: (string | null | undefined)[]) {
    const unicos = [...new Set(ids.filter((v): v is string => !!v))];
    const usuarios = unicos.length
      ? await tx.usuario.findMany({
          where: { id: { in: unicos } },
          select: { id: true, nombre: true },
        })
      : [];
    return (id: string | null | undefined) =>
      id ? (usuarios.find((u) => u.id === id)?.nombre ?? 'Usuario') : null;
  }

  /** Movimientos de una unidad hasta el corte, en orden, con el saldo acumulado. */
  private async movimientos(
    tx: Tx,
    condominioId: string,
    donde: Prisma.MovimientoCarteraWhereInput,
    corte: string,
  ) {
    const lista = await tx.movimientoCartera.findMany({
      where: { condominioId, fecha: { lte: aFecha(corte) }, ...donde },
      include: { obligacion: { select: { numero: true, concepto: true, periodo: true } } },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
    const recaudos = await tx.recaudo.findMany({
      where: {
        condominioId,
        id: { in: lista.map((m) => m.recaudoId).filter((v): v is string => !!v) },
      },
      select: { id: true, numero: true },
    });
    let saldo = CERO;
    return lista.map((m) => {
      const aumenta = signoDe(m.tipo) > 0;
      saldo = aumenta ? saldo.plus(m.valor) : saldo.minus(m.valor);
      const r = recaudos.find((x) => x.id === m.recaudoId);
      return {
        id: m.id,
        fecha: dia(m.fecha),
        tipo: m.tipo,
        obligacionId: m.obligacionId,
        obligacion: numeroObligacion(m.obligacion.numero),
        concepto: m.obligacion.concepto,
        periodo: m.obligacion.periodo,
        descripcion: m.descripcion,
        recaudoId: m.recaudoId,
        recaudo: r ? numeroVisible(r.numero) : null,
        cargo: aumenta ? m.valor : null,
        abono: aumenta ? null : m.valor,
        saldo,
      };
    });
  }

  private async cuentaDeUnidad(tx: Tx, condominioId: string, unidadId: string, corte: string) {
    const [u] = await this.unidades(tx, condominioId, { unidadId });
    if (!u) throw new NotFoundException('Unidad no encontrada.');
    const mapa = new Map([[u.id, u]]);
    const [obligaciones, movimientos, aFavor, gestiones, compromisos, sinVerificar] =
      await Promise.all([
        this.obligacionesAlCorte(tx, condominioId, corte, {}, mapa),
        this.movimientos(tx, condominioId, { unidadId }, corte),
        this.saldosAFavor(tx, condominioId, corte),
        tx.gestionCobro.findMany({
          where: { condominioId, unidadId },
          orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
          take: 200,
        }),
        tx.compromisoPago.findMany({
          where: { condominioId, unidadId },
          orderBy: { fechaPactada: 'desc' },
          take: 200,
        }),
        // CA-02: se muestran aparte; no reducen el saldo hasta ser verificados.
        tx.recaudo.findMany({
          where: { condominioId, unidadId, estado: { in: ['PENDIENTE', 'OBSERVADO'] } },
          select: { id: true, numero: true, fechaPago: true, valor: true, estado: true },
          orderBy: { fechaPago: 'desc' },
        }),
      ]);
    const nombre = await this.nombres(tx, [
      ...gestiones.map((g) => g.creadoPor),
      ...compromisos.map((c) => c.creadoPor),
    ]);
    const abiertas = obligaciones.filter((o) => o.saldo.gt(0));
    return {
      corte,
      unidad: { id: u.id, codigo: u.codigo, tipo: u.tipo, activa: u.activa },
      propietarios: u.propietarios,
      totales: {
        cargos: sumar(obligaciones, (o) => o.cargos),
        pagos: sumar(obligaciones, (o) => o.pagos),
        creditos: sumar(obligaciones, (o) => o.creditos),
        saldo: sumar(abiertas, (o) => o.saldo),
        vencido: sumar(
          abiertas.filter((o) => o.vencida),
          (o) => o.saldo,
        ),
        saldoAFavor: aFavor.get(u.id) ?? CERO,
        porTramo: this.porTramo(abiertas),
      },
      obligaciones,
      movimientos,
      gestiones: gestiones.map((g) => ({
        ...g,
        fecha: dia(g.fecha),
        proximaFecha: g.proximaFecha ? dia(g.proximaFecha) : null,
        responsable: nombre(g.creadoPor),
      })),
      compromisos: compromisos.map((c) => ({
        ...c,
        fechaPactada: dia(c.fechaPactada),
        responsable: nombre(c.creadoPor),
      })),
      recaudosSinVerificar: sinVerificar.map((r) => ({
        id: r.id,
        numeroVisible: numeroVisible(r.numero),
        fechaPago: dia(r.fechaPago),
        valor: r.valor,
        estado: r.estado,
      })),
    };
  }

  async estadoDeCuenta(unidadId: string, corte = hoyEnBogota()) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, (tx) =>
      this.cuentaDeUnidad(tx, condominioId, unidadId, corte),
    );
  }

  async detalleObligacion(id: string) {
    const { condominioId } = ctx();
    const corte = hoyEnBogota();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const o = await tx.obligacion.findFirst({ where: { id, condominioId } });
      if (!o) throw new NotFoundException('Obligación no encontrada.');
      const [u] = await this.unidades(tx, condominioId, { unidadId: o.unidadId });
      const [movimientos, ajustes, bitacora] = await Promise.all([
        this.movimientos(tx, condominioId, { obligacionId: id }, corte),
        tx.ajusteCartera.findMany({
          where: { condominioId, obligacionId: id },
          orderBy: { createdAt: 'desc' },
        }),
        tx.auditoria.findMany({
          where: { condominioId, objetoTipo: 'obligacion', objetoId: id },
          orderBy: { id: 'asc' },
          take: 200,
        }),
      ]);
      const crudos = await tx.movimientoCartera.findMany({
        where: { condominioId, obligacionId: id },
        select: { tipo: true, valor: true },
      });
      const nombre = await this.nombres(tx, [
        o.creadoPor,
        ...ajustes.flatMap((a) => [a.solicitadoPor, a.resueltoPor]),
        ...bitacora.map((b) => b.actorId),
      ]);
      return {
        id: o.id,
        numeroVisible: numeroObligacion(o.numero),
        unidad: { id: u!.id, codigo: u!.codigo, tipo: u!.tipo },
        propietarios: u!.propietarios,
        concepto: o.concepto,
        periodo: o.periodo,
        descripcion: o.descripcion,
        origen: o.origen,
        fechaEmision: dia(o.fechaEmision),
        fechaVencimiento: dia(o.fechaVencimiento),
        valor: o.valor,
        creadoPorNombre: nombre(o.creadoPor),
        createdAt: o.createdAt,
        ...calcularSaldo(crudos, dia(o.fechaVencimiento), corte),
        movimientos,
        ajustes: ajustes.map((a) => ({
          ...a,
          solicitadoPorNombre: nombre(a.solicitadoPor),
          resueltoPorNombre: nombre(a.resueltoPor),
        })),
        historial: bitacora.map((b) => ({
          id: String(b.id),
          accion: b.accion,
          actor: nombre(b.actorId) ?? 'Sistema',
          despues: b.despues,
          createdAt: b.createdAt,
        })),
      };
    });
  }

  // ───────────────────────── Obligaciones ─────────────────────────

  private async siguienteNumero(tx: Tx, condominioId: string) {
    const { _max } = await tx.obligacion.aggregate({
      where: { condominioId },
      _max: { numero: true },
    });
    return (_max.numero ?? 0) + 1;
  }

  async crearObligacion(d: CrearObligacion) {
    const { condominioId, usuarioId } = ctx();
    const valor = parsearValor(d.valor)!;
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidad = await tx.unidadPrivada.findFirst({
        where: { id: d.unidadId, condominioId },
        select: { id: true },
      });
      if (!unidad) throw new NotFoundException('Unidad no encontrada.');
      await this.bloquear(tx, condominioId);
      if (d.concepto !== 'OTRO') {
        const repetida = await tx.obligacion.findFirst({
          where: { condominioId, unidadId: d.unidadId, concepto: d.concepto, periodo: d.periodo },
          select: { numero: true },
        });
        if (repetida) {
          throw new ConflictException(
            `La unidad ya tiene una obligación de ese concepto y periodo (${numeroObligacion(repetida.numero)}).`,
          );
        }
      }
      const o = await tx.obligacion.create({
        data: {
          condominioId,
          numero: await this.siguienteNumero(tx, condominioId),
          unidadId: d.unidadId,
          concepto: d.concepto,
          periodo: d.periodo,
          descripcion: limpio(d.descripcion),
          fechaEmision: aFecha(d.fechaEmision),
          fechaVencimiento: aFecha(d.fechaVencimiento),
          valor,
          creadoPor: usuarioId,
        },
      });
      await tx.movimientoCartera.create({
        data: {
          condominioId,
          unidadId: d.unidadId,
          obligacionId: o.id,
          tipo: 'CARGO',
          valor,
          fecha: aFecha(d.fechaEmision),
          descripcion: `${NOMBRE_CONCEPTO[d.concepto]} ${d.periodo}`,
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.obligacion_creada',
        objetoTipo: 'obligacion',
        objetoId: o.id,
        condominioId,
        actorId: usuarioId,
        despues: {
          numero: numeroObligacion(o.numero),
          unidadId: o.unidadId,
          concepto: o.concepto,
          periodo: o.periodo,
          fechaVencimiento: d.fechaVencimiento,
          valor,
          origen: 'MANUAL',
        },
      });
      return {
        id: o.id,
        numeroVisible: numeroObligacion(o.numero),
        valor,
        periodo: o.periodo,
        concepto: o.concepto,
      };
    });
  }

  /** Crea la cuota de administración del periodo para cada unidad activa con cuota definida. */
  async generarObligaciones(d: GenerarObligaciones) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.bloquear(tx, condominioId);
      const [unidades, existentes] = await Promise.all([
        tx.unidadPrivada.findMany({
          where: { condominioId, activa: true },
          select: { id: true, cuotaMensual: true },
        }),
        tx.obligacion.findMany({
          where: { condominioId, concepto: 'CUOTA_ADMINISTRACION', periodo: d.periodo },
          select: { unidadId: true },
        }),
      ]);
      const yaTienen = new Set(existentes.map((o) => o.unidadId));
      const sinCuota = unidades.filter((u) => !u.cuotaMensual || u.cuotaMensual.lte(0)).length;
      const pendientes = unidades.filter((u) => u.cuotaMensual?.gt(0) && !yaTienen.has(u.id));
      if (pendientes.length === 0) {
        throw new ConflictException(
          'No hay unidades por generar: ya tienen la cuota de ese periodo o no tienen cuota mensual definida.',
        );
      }
      let numero = await this.siguienteNumero(tx, condominioId);
      const nuevas = pendientes.map((u) => ({
        id: randomUUID(),
        condominioId,
        numero: numero++,
        unidadId: u.id,
        concepto: 'CUOTA_ADMINISTRACION' as const,
        periodo: d.periodo,
        fechaEmision: aFecha(d.fechaEmision),
        fechaVencimiento: aFecha(d.fechaVencimiento),
        valor: u.cuotaMensual!,
        origen: 'GENERACION' as const,
        creadoPor: usuarioId,
      }));
      await tx.obligacion.createMany({ data: nuevas });
      await tx.movimientoCartera.createMany({
        data: nuevas.map((o) => ({
          condominioId,
          unidadId: o.unidadId,
          obligacionId: o.id,
          tipo: 'CARGO' as const,
          valor: o.valor,
          fecha: o.fechaEmision,
          descripcion: `${NOMBRE_CONCEPTO.CUOTA_ADMINISTRACION} ${d.periodo}`,
          creadoPor: usuarioId,
        })),
      });
      const resultado = {
        creadas: nuevas.length,
        valor: sumar(nuevas, (o) => o.valor),
        yaExistian: unidades.filter((u) => yaTienen.has(u.id)).length,
        sinCuota,
      };
      const eventos: EventoAuditoria[] = nuevas.map((o) => ({
        accion: 'cartera.obligacion_creada',
        objetoTipo: 'obligacion',
        objetoId: o.id,
        condominioId,
        actorId: usuarioId,
        despues: {
          numero: numeroObligacion(o.numero),
          unidadId: o.unidadId,
          concepto: o.concepto,
          periodo: o.periodo,
          fechaVencimiento: d.fechaVencimiento,
          valor: o.valor,
          origen: 'GENERACION',
        },
      }));
      eventos.push({
        accion: 'cartera.obligaciones_generadas',
        objetoTipo: 'cartera',
        objetoId: condominioId,
        condominioId,
        actorId: usuarioId,
        despues: { ...d, ...resultado },
      });
      await this.auditoria.registrarVarios(tx, eventos);
      return resultado;
    });
  }

  // ───────────────────── Gestiones y compromisos ─────────────────────

  private async exigirUnidad(tx: Tx, condominioId: string, unidadId: string) {
    const u = await tx.unidadPrivada.findFirst({
      where: { id: unidadId, condominioId },
      select: { id: true },
    });
    if (!u) throw new NotFoundException('Unidad no encontrada.');
  }

  async crearGestion(d: CrearGestion) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.exigirUnidad(tx, condominioId, d.unidadId);
      const g = await tx.gestionCobro.create({
        data: {
          condominioId,
          unidadId: d.unidadId,
          fecha: aFecha(d.fecha),
          canal: d.canal,
          contacto: limpio(d.contacto),
          resultado: d.resultado,
          proximaFecha: d.proximaFecha ? aFecha(d.proximaFecha) : null,
          creadoPor: usuarioId,
        },
      });
      const compromiso = d.compromiso
        ? await tx.compromisoPago.create({
            data: {
              condominioId,
              unidadId: d.unidadId,
              gestionId: g.id,
              fechaPactada: aFecha(d.compromiso.fechaPactada),
              valor: parsearValor(d.compromiso.valor)!,
              observaciones: d.compromiso.observaciones?.trim() || null,
              creadoPor: usuarioId,
            },
          })
        : null;
      const eventos: EventoAuditoria[] = [
        {
          accion: 'cartera.gestion_registrada',
          objetoTipo: 'gestion_cobro',
          objetoId: g.id,
          condominioId,
          actorId: usuarioId,
          despues: {
            unidadId: g.unidadId,
            fecha: d.fecha,
            canal: g.canal,
            proximaFecha: d.proximaFecha ?? null,
          },
        },
      ];
      if (compromiso) {
        eventos.push({
          accion: 'cartera.compromiso_registrado',
          objetoTipo: 'compromiso_pago',
          objetoId: compromiso.id,
          condominioId,
          actorId: usuarioId,
          despues: {
            unidadId: g.unidadId,
            gestionId: g.id,
            fechaPactada: d.compromiso!.fechaPactada,
            valor: compromiso.valor,
          },
        });
      }
      await this.auditoria.registrarVarios(tx, eventos);
      return {
        ...g,
        fecha: d.fecha,
        proximaFecha: d.proximaFecha ?? null,
        compromiso: compromiso ? { ...compromiso, fechaPactada: d.compromiso!.fechaPactada } : null,
      };
    });
  }

  private async gestionesTx(tx: Tx, condominioId: string, f: FiltrosGestiones) {
    const lista = await tx.gestionCobro.findMany({
      where: {
        condominioId,
        ...(f.unidadId ? { unidadId: f.unidadId } : {}),
        ...(f.desde || f.hasta
          ? {
              fecha: {
                ...(f.desde ? { gte: aFecha(f.desde) } : {}),
                ...(f.hasta ? { lte: aFecha(f.hasta) } : {}),
              },
            }
          : {}),
      },
      include: {
        unidad: { select: { id: true, codigo: true, tipo: true } },
        compromisos: { select: { id: true, valor: true, fechaPactada: true, estado: true } },
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const nombre = await this.nombres(
      tx,
      lista.map((g) => g.creadoPor),
    );
    return lista.map((g) => ({
      ...g,
      fecha: dia(g.fecha),
      proximaFecha: g.proximaFecha ? dia(g.proximaFecha) : null,
      responsable: nombre(g.creadoPor),
      compromisos: g.compromisos.map((c) => ({ ...c, fechaPactada: dia(c.fechaPactada) })),
    }));
  }

  async listarGestiones(f: FiltrosGestiones) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, (tx) => this.gestionesTx(tx, condominioId, f));
  }

  async crearCompromiso(d: CrearCompromiso) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.exigirUnidad(tx, condominioId, d.unidadId);
      const c = await tx.compromisoPago.create({
        data: {
          condominioId,
          unidadId: d.unidadId,
          fechaPactada: aFecha(d.fechaPactada),
          valor: parsearValor(d.valor)!,
          observaciones: d.observaciones?.trim() || null,
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.compromiso_registrado',
        objetoTipo: 'compromiso_pago',
        objetoId: c.id,
        condominioId,
        actorId: usuarioId,
        despues: { unidadId: c.unidadId, fechaPactada: d.fechaPactada, valor: c.valor },
      });
      return { ...c, fechaPactada: d.fechaPactada };
    });
  }

  async listarCompromisos(f: FiltrosCompromisos) {
    const { condominioId } = ctx();
    const hoy = hoyEnBogota();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const lista = await tx.compromisoPago.findMany({
        where: {
          condominioId,
          ...(f.unidadId ? { unidadId: f.unidadId } : {}),
          ...(f.estado ? { estado: f.estado } : {}),
        },
        include: { unidad: { select: { id: true, codigo: true, tipo: true } } },
        orderBy: [{ fechaPactada: 'asc' }],
        take: 500,
      });
      const nombre = await this.nombres(
        tx,
        lista.map((c) => c.creadoPor),
      );
      return lista.map((c) => ({
        ...c,
        fechaPactada: dia(c.fechaPactada),
        // Abierto con la fecha pactada ya cumplida: requiere seguimiento.
        vencido: c.estado === 'ABIERTO' && dia(c.fechaPactada) < hoy,
        responsable: nombre(c.creadoPor),
      }));
    });
  }

  async cambiarCompromiso(id: string, d: CambiarCompromiso) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.compromisoPago.findFirst({ where: { id, condominioId } });
      if (!anterior) throw new NotFoundException('Compromiso no encontrado.');
      const cambio = await tx.compromisoPago.updateMany({
        where: { id, condominioId, estado: 'ABIERTO' },
        data: {
          estado: d.estado,
          ...(d.observaciones?.trim() ? { observaciones: d.observaciones.trim() } : {}),
        },
      });
      if (cambio.count !== 1) throw new ConflictException('El compromiso ya fue cerrado.');
      await this.auditoria.registrar(tx, {
        accion: 'cartera.compromiso_actualizado',
        objetoTipo: 'compromiso_pago',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: { estado: anterior.estado },
        despues: { estado: d.estado, observaciones: d.observaciones?.trim() || null },
      });
      return { id, estado: d.estado };
    });
  }

  // ───────────────────────── Ajustes ─────────────────────────

  private async saldoActual(tx: Tx, condominioId: string, obligacionId: string) {
    const movimientos = await tx.movimientoCartera.findMany({
      where: { condominioId, obligacionId },
      select: { tipo: true, valor: true },
    });
    return movimientos.reduce(
      (s, m) => (signoDe(m.tipo) > 0 ? s.plus(m.valor) : s.minus(m.valor)),
      CERO,
    );
  }

  async solicitarAjuste(d: CrearAjuste) {
    const { condominioId, usuarioId } = ctx();
    const valor = parsearValor(d.valor)!;
    return this.prisma.withTenant(condominioId, async (tx) => {
      const o = await tx.obligacion.findFirst({ where: { id: d.obligacionId, condominioId } });
      if (!o) throw new NotFoundException('Obligación no encontrada.');
      if (d.tipo === 'CREDITO' && valor.gt(await this.saldoActual(tx, condominioId, o.id))) {
        throw new BadRequestException(
          'El ajuste crédito no puede superar el saldo pendiente de la obligación.',
        );
      }
      const a = await tx.ajusteCartera.create({
        data: {
          condominioId,
          obligacionId: o.id,
          tipo: d.tipo,
          valor,
          motivo: d.motivo,
          soporte: limpio(d.soporte),
          solicitadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.ajuste_solicitado',
        objetoTipo: 'obligacion',
        objetoId: o.id,
        condominioId,
        actorId: usuarioId,
        despues: { ajusteId: a.id, tipo: a.tipo, valor, motivo: a.motivo, soporte: a.soporte },
      });
      return a;
    });
  }

  async listarAjustes(estado?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO') {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const lista = await tx.ajusteCartera.findMany({
        where: { condominioId, ...(estado ? { estado } : {}) },
        include: {
          obligacion: {
            select: {
              numero: true,
              concepto: true,
              periodo: true,
              valor: true,
              unidad: { select: { id: true, codigo: true, tipo: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      const nombre = await this.nombres(
        tx,
        lista.flatMap((a) => [a.solicitadoPor, a.resueltoPor]),
      );
      return lista.map(({ obligacion, ...a }) => ({
        ...a,
        obligacion: {
          numeroVisible: numeroObligacion(obligacion.numero),
          concepto: obligacion.concepto,
          periodo: obligacion.periodo,
          valor: obligacion.valor,
        },
        unidad: obligacion.unidad,
        solicitadoPorNombre: nombre(a.solicitadoPor),
        resueltoPorNombre: nombre(a.resueltoPor),
        // Quien lo solicitó no puede resolverlo.
        esPropio: a.solicitadoPor === usuarioId,
      }));
    });
  }

  async resolverAjuste(id: string, d: ResolverAjuste) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const a = await tx.ajusteCartera.findFirst({
        where: { id, condominioId },
        include: { obligacion: true },
      });
      if (!a) throw new NotFoundException('Ajuste no encontrado.');
      if (a.solicitadoPor === usuarioId) {
        throw new ForbiddenException(
          'Quien solicita un ajuste no puede resolverlo: debe autorizarlo otra persona.',
        );
      }
      await this.bloquear(tx, condominioId);
      // El saldo pudo cambiar desde la solicitud (por ejemplo, entró un pago).
      if (
        d.aprobar &&
        a.tipo === 'CREDITO' &&
        a.valor.gt(await this.saldoActual(tx, condominioId, a.obligacionId))
      ) {
        throw new ConflictException(
          'El ajuste crédito ya supera el saldo pendiente. Rechácelo y solicite uno nuevo.',
        );
      }
      const cambio = await tx.ajusteCartera.updateMany({
        where: { id, condominioId, estado: 'PENDIENTE' },
        data: {
          estado: d.aprobar ? 'APROBADO' : 'RECHAZADO',
          resueltoPor: usuarioId,
          resueltoEn: new Date(),
          notaResolucion: d.nota,
        },
      });
      if (cambio.count !== 1) throw new ConflictException('El ajuste ya fue resuelto.');
      if (d.aprobar) {
        await tx.movimientoCartera.create({
          data: {
            condominioId,
            unidadId: a.obligacion.unidadId,
            obligacionId: a.obligacionId,
            tipo: a.tipo === 'DEBITO' ? 'AJUSTE_DEBITO' : 'AJUSTE_CREDITO',
            valor: a.valor,
            fecha: aFecha(hoyEnBogota()),
            ajusteId: a.id,
            descripcion: a.motivo.slice(0, 300),
            creadoPor: usuarioId,
          },
        });
      }
      await this.auditoria.registrar(tx, {
        accion: d.aprobar ? 'cartera.ajuste_aprobado' : 'cartera.ajuste_rechazado',
        objetoTipo: 'obligacion',
        objetoId: a.obligacionId,
        condominioId,
        actorId: usuarioId,
        antes: { ajusteId: a.id, estado: 'PENDIENTE', solicitadoPor: a.solicitadoPor },
        despues: {
          ajusteId: a.id,
          estado: d.aprobar ? 'APROBADO' : 'RECHAZADO',
          tipo: a.tipo,
          valor: a.valor,
          nota: d.nota,
        },
      });
      return { id, estado: d.aprobar ? 'APROBADO' : 'RECHAZADO' };
    });
  }

  // ───────────────────── Importación de saldos iniciales ─────────────────────

  /** RN-08: revisa cada fila y guarda un borrador. No crea ninguna obligación. */
  async previsualizarSaldos(archivo: ArchivoCargado, fechaCorte: string) {
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.originalname)) {
      throw new BadRequestException('Use un archivo Excel (.xlsx, .xls) o CSV.');
    }
    let crudas: Record<string, unknown>[];
    try {
      const libro = XLSX.read(archivo.buffer, {
        type: 'buffer',
        cellDates: true,
        raw: /\.csv$/i.test(archivo.originalname),
      });
      const hoja = libro.Sheets[libro.SheetNames[0] ?? ''];
      if (!hoja) throw new Error('sin hojas');
      crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
        defval: '',
        raw: true,
        blankrows: false,
      });
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo. Verifique que sea un Excel o CSV válido.',
      );
    }
    if (crudas.length === 0) throw new BadRequestException('El archivo no tiene filas con datos.');
    if (crudas.length > 2000)
      throw new BadRequestException('El archivo supera el máximo de 2.000 filas.');

    const clave = (k: string) => sinTildes(k).replace(/[^a-z]/g, '');
    const ALIAS: Record<string, string[]> = {
      unidad: ['unidad', 'codigo', 'codigounidad', 'villa', 'lote', 'inmueble'],
      periodo: ['periodo', 'mes'],
      fechaVencimiento: ['fechavencimiento', 'vencimiento', 'fechadevencimiento', 'vence'],
      valor: ['valor', 'saldo', 'saldopendiente', 'deuda'],
      descripcion: ['descripcion', 'concepto', 'detalle', 'observacion'],
    };
    const columnas = Object.keys(crudas[0] ?? {});
    const columnaDe = (campo: string) => columnas.find((c) => ALIAS[campo]!.includes(clave(c)));
    const faltan = ['unidad', 'periodo', 'valor'].filter((c) => !columnaDe(c));
    if (faltan.length) {
      throw new BadRequestException(
        `Faltan columnas en el archivo: ${faltan.join(', ')}. Use unidad, periodo, vencimiento, valor y, opcional, descripción.`,
      );
    }
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const [unidades, existentes] = await Promise.all([
        tx.unidadPrivada.findMany({ where: { condominioId }, select: { id: true, codigo: true } }),
        tx.obligacion.findMany({
          where: { condominioId },
          select: { unidadId: true, concepto: true, periodo: true },
        }),
      ]);
      const porCodigo = new Map(unidades.map((u) => [u.codigo.trim().toLowerCase(), u.id]));
      const saldosPrevios = new Set(
        existentes
          .filter((o) => o.concepto === 'SALDO_INICIAL')
          .map((o) => `${o.unidadId}|${o.periodo}`),
      );
      const conCartera = new Set(existentes.map((o) => o.unidadId));
      const enArchivo = new Set<string>();

      const filas: FilaSaldo[] = crudas.map((cruda, i) => {
        const leer = (campo: string) => {
          const c = columnaDe(campo);
          return c ? cruda[c] : '';
        };
        const mensajes: string[] = [];
        const unidad = String(leer('unidad') ?? '').trim();
        const unidadId = porCodigo.get(unidad.toLowerCase()) ?? null;
        if (!unidad) mensajes.push('Falta la unidad');
        else if (!unidadId) mensajes.push(`La unidad ${unidad.slice(0, 60)} no existe`);
        // El periodo acepta AAAA-MM o una fecha (se toma su mes).
        const crudoPeriodo = leer('periodo');
        const textoPeriodo = String(crudoPeriodo ?? '').trim();
        const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(textoPeriodo)
          ? textoPeriodo
          : (parsearFecha(crudoPeriodo instanceof Date ? crudoPeriodo : textoPeriodo)?.slice(
              0,
              7,
            ) ?? null);
        if (!periodo) mensajes.push('Periodo no válido (use AAAA-MM)');
        const crudoVence = leer('fechaVencimiento');
        const hayVence = crudoVence instanceof Date || String(crudoVence ?? '').trim() !== '';
        // Sin vencimiento en el archivo se asume la fecha de corte.
        const fechaVencimiento = hayVence
          ? parsearFecha(crudoVence instanceof Date ? crudoVence : String(crudoVence).trim())
          : fechaCorte;
        if (!fechaVencimiento) mensajes.push('Fecha de vencimiento no válida (use DD/MM/AAAA)');
        const crudoValor = leer('valor');
        const valor = parsearValor(
          typeof crudoValor === 'number' ? crudoValor : String(crudoValor ?? ''),
        );
        if (!valor) mensajes.push('Valor no válido: debe ser mayor que cero');
        let resultado: ResultadoFila = mensajes.length ? 'ERROR' : 'VALIDA';
        if (resultado === 'VALIDA') {
          const k = `${unidadId}|${periodo}`;
          if (saldosPrevios.has(k)) {
            resultado = 'DUPLICADO';
            mensajes.push('Ya existe un saldo inicial de esa unidad y periodo');
          } else if (enArchivo.has(k)) {
            resultado = 'DUPLICADO';
            mensajes.push('Repetido dentro del mismo archivo');
          } else if (conCartera.has(unidadId!)) {
            resultado = 'ADVERTENCIA';
            mensajes.push(
              'La unidad ya tiene obligaciones registradas: revise que no se duplique la deuda',
            );
          }
          enArchivo.add(k);
        }
        return {
          fila: i + 2,
          resultado,
          mensajes,
          unidad: unidad.slice(0, 60),
          unidadId,
          periodo,
          fechaVencimiento,
          valor: valor?.toString() ?? null,
          descripcion: limpio(String(leer('descripcion') ?? ''))?.slice(0, 300) ?? null,
        };
      });
      const cuenta = (r: ResultadoFila) => filas.filter((f) => f.resultado === r).length;
      const importables = filas.filter(
        (f) => f.resultado === 'VALIDA' || f.resultado === 'ADVERTENCIA',
      );
      const resumen = {
        total: filas.length,
        validas: cuenta('VALIDA'),
        advertencias: cuenta('ADVERTENCIA'),
        duplicados: cuenta('DUPLICADO'),
        errores: cuenta('ERROR'),
        valor: sumar(importables, (f) => new Prisma.Decimal(f.valor!)).toString(),
      };
      const borrador = await tx.importacionCartera.create({
        data: {
          condominioId,
          archivo: archivo.originalname.replace(/[\\/\p{Cc}]/gu, '_').slice(-180),
          fechaCorte: aFecha(fechaCorte),
          filas: filas as unknown as Prisma.InputJsonValue,
          resumen,
          creadaPor: usuarioId,
        },
        select: { id: true, archivo: true, estado: true },
      });
      return { ...borrador, fechaCorte, filas, resumen };
    });
  }

  async aprobarSaldos(id: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const imp = await tx.importacionCartera.findFirst({
        where: { id, condominioId, estado: 'PENDIENTE' },
      });
      if (!imp) throw new NotFoundException('Importación pendiente no encontrada.');
      await this.bloquear(tx, condominioId);
      const reclamada = await tx.importacionCartera.updateMany({
        where: { id, condominioId, estado: 'PENDIENTE' },
        data: { estado: 'APROBADA', aprobadaPor: usuarioId, cerradaEn: new Date() },
      });
      if (reclamada.count !== 1) throw new ConflictException('La importación ya fue procesada.');
      const filas = imp.filas as unknown as FilaSaldo[];
      // Se revisa de nuevo contra lo que exista ahora: evita duplicar saldos entre dos importaciones.
      const previos = new Set(
        (
          await tx.obligacion.findMany({
            where: { condominioId, concepto: 'SALDO_INICIAL' },
            select: { unidadId: true, periodo: true },
          })
        ).map((o) => `${o.unidadId}|${o.periodo}`),
      );
      const aptas = filas.filter(
        (f) =>
          (f.resultado === 'VALIDA' || f.resultado === 'ADVERTENCIA') &&
          f.unidadId &&
          !previos.has(`${f.unidadId}|${f.periodo}`),
      );
      if (aptas.length === 0) throw new ConflictException('No hay filas válidas para importar.');
      let numero = await this.siguienteNumero(tx, condominioId);
      const corte = dia(imp.fechaCorte);
      const nuevas = aptas.map((f) => ({
        id: randomUUID(),
        condominioId,
        numero: numero++,
        unidadId: f.unidadId!,
        concepto: 'SALDO_INICIAL' as const,
        periodo: f.periodo!,
        descripcion: f.descripcion ?? `Saldo inicial al ${corte}`,
        fechaEmision: imp.fechaCorte,
        fechaVencimiento: aFecha(f.fechaVencimiento!),
        valor: new Prisma.Decimal(f.valor!),
        origen: 'IMPORTACION' as const,
        importacionId: id,
        creadoPor: usuarioId,
      }));
      await tx.obligacion.createMany({ data: nuevas });
      await tx.movimientoCartera.createMany({
        data: nuevas.map((o) => ({
          condominioId,
          unidadId: o.unidadId,
          obligacionId: o.id,
          tipo: 'CARGO' as const,
          valor: o.valor,
          fecha: o.fechaEmision,
          descripcion: `Saldo inicial importado (${o.periodo})`,
          creadoPor: usuarioId,
        })),
      });
      const resultado = {
        creadas: nuevas.length,
        omitidas: filas.length - nuevas.length,
        valor: sumar(nuevas, (o) => o.valor),
      };
      const eventos: EventoAuditoria[] = nuevas.map((o) => ({
        accion: 'cartera.obligacion_creada',
        objetoTipo: 'obligacion',
        objetoId: o.id,
        condominioId,
        actorId: usuarioId,
        despues: {
          numero: numeroObligacion(o.numero),
          unidadId: o.unidadId,
          concepto: o.concepto,
          periodo: o.periodo,
          valor: o.valor,
          origen: 'IMPORTACION',
          importacionId: id,
        },
      }));
      eventos.push({
        accion: 'cartera.saldos_iniciales_aprobados',
        objetoTipo: 'importacion_cartera',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: { estado: 'PENDIENTE', creadaPor: imp.creadaPor },
        despues: { estado: 'APROBADA', archivo: imp.archivo, fechaCorte: corte, ...resultado },
      });
      await this.auditoria.registrarVarios(tx, eventos);
      return resultado;
    });
  }

  async descartarSaldos(id: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const cambio = await tx.importacionCartera.updateMany({
        where: { id, condominioId, estado: 'PENDIENTE' },
        data: { estado: 'DESCARTADA', cerradaEn: new Date(), filas: [] },
      });
      if (cambio.count !== 1) throw new NotFoundException('Importación pendiente no encontrada.');
      await this.auditoria.registrar(tx, {
        accion: 'cartera.importacion_descartada',
        objetoTipo: 'importacion_cartera',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
      });
      return { estado: 'DESCARTADA' };
    });
  }

  // ───────────────────────── Reportes ─────────────────────────

  /** CA-10: el reporte usa los mismos filtros, cálculo y fecha de corte que el listado. */
  async reporte(tipo: TipoReporte, consulta: ConsultaReporte): Promise<Reporte> {
    const { condominioId, usuarioId } = ctx();
    const { formato, ...f } = consulta;
    const corte = f.corte ?? hoyEnBogota();
    if (tipo === 'estado-cuenta' && !f.unidadId) {
      throw new BadRequestException('Seleccione la unidad para generar el estado de cuenta.');
    }
    return this.prisma.withTenant(condominioId, async (tx) => {
      const condominio = await tx.condominio.findFirst({
        where: { id: condominioId },
        select: { razonSocial: true },
      });
      const nombres = (ps: { nombre: string }[]) =>
        ps.map((p) => p.nombre).join(', ') || 'Sin propietario registrado';
      const unidad = (u: { codigo: string; tipo: string }) =>
        `${u.tipo === 'VILLA' ? 'Villa' : 'Lote'} ${u.codigo}`;
      let reporte: Omit<Reporte, 'entidad' | 'corte'>;

      if (tipo === 'general') {
        const c = await this.carteraPorUnidad(tx, condominioId, { ...f, corte });
        reporte = {
          titulo: 'Cartera general',
          archivo: `cartera-general-${corte}`,
          columnas: [
            { titulo: 'Unidad', ancho: 2 },
            { titulo: 'Propietario', ancho: 4 },
            { titulo: 'Saldo', ancho: 2, dinero: true },
            { titulo: 'Corriente', ancho: 2, dinero: true },
            { titulo: '1–30', ancho: 2, dinero: true },
            { titulo: '31–60', ancho: 2, dinero: true },
            { titulo: '61–90', ancho: 2, dinero: true },
            { titulo: 'Más de 90', ancho: 2, dinero: true },
            { titulo: 'Saldo a favor', ancho: 2, dinero: true },
          ],
          filas: c.unidades.map((u) => [
            unidad(u.unidad),
            nombres(u.propietarios),
            u.saldo.toNumber(),
            u.porTramo.CORRIENTE.toNumber(),
            u.porTramo['01_30'].toNumber(),
            u.porTramo['31_60'].toNumber(),
            u.porTramo['61_90'].toNumber(),
            u.porTramo.MAS_90.toNumber(),
            u.saldoAFavor.toNumber(),
          ]),
          totales: [
            'Total',
            `${c.resumen.unidadesConSaldo} unidades con saldo`,
            c.resumen.total.toNumber(),
            c.resumen.porTramo.CORRIENTE.toNumber(),
            c.resumen.porTramo['01_30'].toNumber(),
            c.resumen.porTramo['31_60'].toNumber(),
            c.resumen.porTramo['61_90'].toNumber(),
            c.resumen.porTramo.MAS_90.toNumber(),
            c.resumen.saldoAFavor.toNumber(),
          ],
        };
      } else if (tipo === 'vencida') {
        const { estado: _estado, ...sinEstado } = f;
        void _estado;
        const o = await this.obligacionesFiltradas(tx, condominioId, {
          ...sinEstado,
          corte,
          estado: 'VENCIDA',
        });
        reporte = {
          titulo: 'Cartera vencida',
          archivo: `cartera-vencida-${corte}`,
          columnas: [
            { titulo: 'Unidad', ancho: 2 },
            { titulo: 'Propietario', ancho: 4 },
            { titulo: 'Obligación', ancho: 2 },
            { titulo: 'Concepto', ancho: 3 },
            { titulo: 'Periodo', ancho: 1.5 },
            { titulo: 'Vencimiento', ancho: 2 },
            { titulo: 'Días de mora', ancho: 1.5, numero: true },
            { titulo: 'Antigüedad', ancho: 2 },
            { titulo: 'Saldo', ancho: 2, dinero: true },
          ],
          filas: o.obligaciones.map((x) => [
            unidad(x.unidad),
            nombres(x.propietarios),
            x.numeroVisible,
            NOMBRE_CONCEPTO[x.concepto],
            x.periodo,
            x.fechaVencimiento,
            x.diasMora,
            NOMBRE_TRAMO[x.tramo],
            x.saldo.toNumber(),
          ]),
          totales: [
            'Total',
            `${o.obligaciones.length} obligaciones vencidas`,
            '',
            '',
            '',
            '',
            '',
            '',
            o.resumen.total.toNumber(),
          ],
        };
      } else if (tipo === 'estado-cuenta') {
        const c = await this.cuentaDeUnidad(tx, condominioId, f.unidadId!, corte);
        reporte = {
          titulo: `Estado de cuenta · ${unidad(c.unidad)}`,
          subtitulo: `${nombres(c.propietarios)} · Saldo pendiente ${c.totales.saldo.toFixed(0)} · Saldo a favor ${c.totales.saldoAFavor.toFixed(0)}`,
          archivo: `estado-cuenta-${c.unidad.codigo.replace(/[^\w-]/g, '_')}-${corte}`,
          columnas: [
            { titulo: 'Fecha', ancho: 2 },
            { titulo: 'Movimiento', ancho: 3 },
            { titulo: 'Obligación', ancho: 2 },
            { titulo: 'Concepto', ancho: 3 },
            { titulo: 'Periodo', ancho: 1.5 },
            { titulo: 'Cargo', ancho: 2, dinero: true },
            { titulo: 'Abono', ancho: 2, dinero: true },
            { titulo: 'Saldo', ancho: 2, dinero: true },
          ],
          filas: c.movimientos.map((m) => [
            m.fecha,
            m.recaudo ? `${NOMBRE_MOVIMIENTO[m.tipo]} ${m.recaudo}` : NOMBRE_MOVIMIENTO[m.tipo],
            m.obligacion,
            NOMBRE_CONCEPTO[m.concepto],
            m.periodo,
            m.cargo?.toNumber() ?? '',
            m.abono?.toNumber() ?? '',
            m.saldo.toNumber(),
          ]),
          totales: ['Saldo pendiente', '', '', '', '', '', '', c.totales.saldo.toNumber()],
        };
      } else {
        const g = await this.gestionesTx(tx, condominioId, { unidadId: f.unidadId, hasta: corte });
        reporte = {
          titulo: 'Gestiones de cobro',
          archivo: `gestiones-cobro-${corte}`,
          columnas: [
            { titulo: 'Fecha', ancho: 2 },
            { titulo: 'Unidad', ancho: 2 },
            { titulo: 'Canal', ancho: 2 },
            { titulo: 'Contacto', ancho: 3 },
            { titulo: 'Resultado', ancho: 6 },
            { titulo: 'Próximo seguimiento', ancho: 2 },
            { titulo: 'Responsable', ancho: 3 },
          ],
          filas: g.map((x) => [
            x.fecha,
            unidad(x.unidad),
            NOMBRE_CANAL[x.canal] ?? x.canal,
            x.contacto ?? '',
            x.resultado,
            x.proximaFecha ?? '',
            x.responsable ?? '',
          ]),
        };
      }
      await this.auditoria.registrar(tx, {
        accion: 'cartera.reporte_exportado',
        objetoTipo: 'cartera',
        objetoId: condominioId,
        condominioId,
        actorId: usuarioId,
        despues: { tipo, formato, corte, filtros: f, filas: reporte.filas.length },
      });
      return { ...reporte, entidad: condominio?.razonSocial ?? '', corte };
    });
  }
}
