import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CrearAjuste,
  CrearCompromiso,
  CrearGestion,
  CrearObligacion,
  FiltrosCartera,
  PrevisualizarSaldos,
  ResolverAjuste,
} from './cartera.dto';
import { calcularSaldo } from './cartera.reglas';

const ctx = () => {
  const c = contexto.actual();
  if (!c.condominioId || !c.usuarioId)
    throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId: c.condominioId, usuarioId: c.usuarioId };
};
const fecha = (s: string) => new Date(`${s}T00:00:00.000Z`);
const incluir = {
  unidad: { select: { id: true, codigo: true, tipo: true } },
  movimientos: {
    select: { tipo: true, valor: true, fecha: true, descripcion: true, recaudoId: true },
    orderBy: { fecha: 'asc' as const },
  },
} satisfies Prisma.ObligacionInclude;

@Injectable()
export class CarteraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}
  private async listarTx(tx: Prisma.TransactionClient, condominioId: string, f: FiltrosCartera) {
    const obligaciones = await tx.obligacion.findMany({
      where: {
        condominioId,
        ...(f.unidadId ? { unidadId: f.unidadId } : {}),
        ...(f.periodoDesde || f.periodoHasta
          ? {
              periodo: {
                ...(f.periodoDesde ? { gte: f.periodoDesde } : {}),
                ...(f.periodoHasta ? { lte: f.periodoHasta } : {}),
              },
            }
          : {}),
      },
      include: incluir,
      orderBy: [{ fechaVencimiento: 'asc' }, { numero: 'desc' }],
    });
    const unidades = await tx.unidadPrivada.findMany({
      where: {
        condominioId,
        ...(f.unidadId ? { id: f.unidadId } : {}),
        ...(f.buscar
          ? {
              OR: [
                { codigo: { contains: f.buscar, mode: 'insensitive' } },
                {
                  titularidades: {
                    some: {
                      hasta: null,
                      propietario: { nombre: { contains: f.buscar, mode: 'insensitive' } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        codigo: true,
        tipo: true,
        titularidades: {
          where: { hasta: null, estado: 'VALIDADO' },
          include: { propietario: { select: { id: true, nombre: true } } },
        },
      },
    });
    const uMap = new Map(unidades.map((u) => [u.id, u]));
    return obligaciones
      .map((o) => {
        const b = calcularSaldo(o);
        const u = uMap.get(o.unidadId);
        return {
          id: o.id,
          numero: o.numero,
          unidadId: o.unidadId,
          unidad: o.unidad,
          propietarios: u?.titularidades.map((t) => t.propietario) ?? [],
          concepto: o.concepto,
          periodo: o.periodo,
          descripcion: o.descripcion,
          fechaEmision: o.fechaEmision.toISOString().slice(0, 10),
          fechaVencimiento: o.fechaVencimiento.toISOString().slice(0, 10),
          valor: o.valor.toString(),
          ...{ saldo: b.saldo.toString(), estado: b.estado, diasMora: b.dias, tramo: b.tramo },
          movimientos: o.movimientos.map((m) => ({
            ...m,
            valor: m.valor.toString(),
            fecha: m.fecha.toISOString().slice(0, 10),
          })),
        };
      })
      .filter(
        (o) =>
          (!f.estado || o.estado === f.estado) &&
          (!f.propietarioId || o.propietarios.some((p) => p.id === f.propietarioId)) &&
          (!f.minimo || Number(o.saldo) >= f.minimo) &&
          (!f.maximo || Number(o.saldo) <= f.maximo),
      );
  }
  async listar(f: FiltrosCartera) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const obligaciones = await this.listarTx(tx, condominioId, f);
      const total = obligaciones.reduce((n, o) => n + Number(o.saldo), 0);
      const porTramo = Object.fromEntries(
        ['CORRIENTE', '01_30', '31_60', '61_90', 'MAS_90'].map((t) => [
          t,
          obligaciones.filter((o) => o.tramo === t).reduce((n, o) => n + Number(o.saldo), 0),
        ]),
      );
      return {
        resumen: {
          total: total.toFixed(2),
          obligaciones: obligaciones.length,
          vencido: obligaciones
            .filter((o) => o.estado === 'VENCIDA' || o.diasMora > 0)
            .reduce((n, o) => n + Number(o.saldo), 0)
            .toFixed(2),
          porTramo,
        },
        obligaciones,
      };
    });
  }
  async crearObligacion(d: CrearObligacion) {
    const { condominioId, usuarioId } = ctx();
    if (d.fechaVencimiento < d.fechaEmision)
      throw new BadRequestException('El vencimiento no puede preceder a la emisión.');
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidad = await tx.unidadPrivada.findFirst({ where: { id: d.unidadId, condominioId } });
      if (!unidad) throw new NotFoundException('Unidad no encontrada.');
      const max = await tx.obligacion.aggregate({
        where: { condominioId },
        _max: { numero: true },
      });
      const valor = new Prisma.Decimal(String(d.valor));
      const o = await tx.obligacion.create({
        data: {
          condominioId,
          numero: (max._max.numero ?? 0) + 1,
          unidadId: d.unidadId,
          concepto: d.concepto,
          periodo: d.periodo,
          descripcion: d.descripcion,
          fechaEmision: fecha(d.fechaEmision),
          fechaVencimiento: fecha(d.fechaVencimiento),
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
          fecha: fecha(d.fechaEmision),
          descripcion: 'Cargo inicial de obligación',
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.obligacion_creada',
        objetoTipo: 'obligacion',
        objetoId: o.id,
        condominioId,
        actorId: usuarioId,
        despues: { numero: o.numero, unidadId: o.unidadId, periodo: o.periodo, valor: o.valor },
      });
      return tx.obligacion.findUniqueOrThrow({ where: { id: o.id }, include: incluir });
    });
  }
  async crearGestion(d: CrearGestion) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      if (!(await tx.unidadPrivada.findFirst({ where: { id: d.unidadId, condominioId } })))
        throw new NotFoundException('Unidad no encontrada.');
      const g = await tx.gestionCobro.create({
        data: {
          ...d,
          fecha: fecha(d.fecha),
          proximaFecha: d.proximaFecha ? fecha(d.proximaFecha) : undefined,
          condominioId,
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.gestion_creada',
        objetoTipo: 'gestion_cobro',
        objetoId: g.id,
        condominioId,
        actorId: usuarioId,
        despues: g,
      });
      return g;
    });
  }
  async crearCompromiso(d: CrearCompromiso) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      if (!(await tx.unidadPrivada.findFirst({ where: { id: d.unidadId, condominioId } })))
        throw new NotFoundException('Unidad no encontrada.');
      const c = await tx.compromisoPago.create({
        data: {
          ...d,
          fechaPactada: fecha(d.fechaPactada),
          valor: new Prisma.Decimal(String(d.valor)),
          condominioId,
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.compromiso_creado',
        objetoTipo: 'compromiso_pago',
        objetoId: c.id,
        condominioId,
        actorId: usuarioId,
        despues: c,
      });
      return c;
    });
  }
  async solicitarAjuste(d: CrearAjuste) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const o = await tx.obligacion.findFirst({
        where: { id: d.obligacionId, condominioId },
        include: incluir,
      });
      if (!o) throw new NotFoundException('Obligación no encontrada.');
      const valor = new Prisma.Decimal(String(d.valor));
      if (d.tipo === 'CREDITO' && valor.gt(calcularSaldo(o).saldo))
        throw new BadRequestException('El crédito supera el saldo pendiente.');
      const a = await tx.ajusteCartera.create({
        data: { ...d, valor, condominioId, solicitadoPor: usuarioId },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.ajuste_solicitado',
        objetoTipo: 'ajuste_cartera',
        objetoId: a.id,
        condominioId,
        actorId: usuarioId,
        despues: a,
      });
      return a;
    });
  }
  async resolverAjuste(id: string, d: ResolverAjuste) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const a = await tx.ajusteCartera.findFirst({ where: { id, condominioId } });
      if (!a) throw new NotFoundException('Ajuste no encontrado.');
      if (a.estado !== 'PENDIENTE') throw new ConflictException('El ajuste ya fue resuelto.');
      if (a.solicitadoPor === usuarioId)
        throw new BadRequestException('Otra persona debe resolver el ajuste.');
      const r = await tx.ajusteCartera.update({
        where: { id },
        data: {
          estado: d.aprobar ? 'APROBADO' : 'RECHAZADO',
          resueltoPor: usuarioId,
          resueltoEn: new Date(),
          notaResolucion: d.nota,
        },
      });
      if (d.aprobar)
        await tx.movimientoCartera.create({
          data: {
            condominioId,
            unidadId: (await tx.obligacion.findUniqueOrThrow({ where: { id: a.obligacionId } }))
              .unidadId,
            obligacionId: a.obligacionId,
            tipo: a.tipo === 'DEBITO' ? 'AJUSTE_DEBITO' : 'AJUSTE_CREDITO',
            valor: a.valor,
            fecha: new Date(),
            ajusteId: a.id,
            descripcion: a.motivo,
            creadoPor: usuarioId,
          },
        });
      await this.auditoria.registrar(tx, {
        accion: d.aprobar ? 'cartera.ajuste_aprobado' : 'cartera.ajuste_rechazado',
        objetoTipo: 'ajuste_cartera',
        objetoId: a.id,
        condominioId,
        actorId: usuarioId,
        antes: a,
        despues: r,
      });
      return r;
    });
  }
  async detalleUnidad(id: string) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidad = await tx.unidadPrivada.findFirst({
        where: { id, condominioId },
        include: {
          titularidades: {
            where: { hasta: null },
            include: {
              propietario: {
                select: { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true },
              },
            },
          },
          gestiones: { orderBy: { fecha: 'desc' }, take: 100 },
          compromisos: { orderBy: { fechaPactada: 'desc' }, take: 100 },
        },
      });
      if (!unidad) throw new NotFoundException('Unidad no encontrada.');
      const obligaciones = await this.listarTx(tx, condominioId, { unidadId: id });
      return { unidad, obligaciones, gestiones: unidad.gestiones, compromisos: unidad.compromisos };
    });
  }
  async previsualizarSaldos(d: PrevisualizarSaldos) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidades = await tx.unidadPrivada.findMany({
        where: { condominioId },
        select: { id: true, codigo: true },
      });
      const porCodigo = new Map(unidades.map((u) => [u.codigo.toLocaleLowerCase(), u]));
      const filas = d.filas.map((f, i) => ({
        fila: i + 2,
        ...f,
        unidadId: porCodigo.get(f.unidad.toLocaleLowerCase())?.id ?? null,
        resultado: porCodigo.has(f.unidad.toLocaleLowerCase()) ? 'VALIDA' : 'UNIDAD_NO_ENCONTRADA',
      }));
      const validas = filas.filter((f) => f.unidadId);
      const resumen = {
        total: filas.length,
        validas: validas.length,
        errores: filas.length - validas.length,
        valor: validas.reduce((s, f) => s + Number(f.valor), 0).toFixed(2),
      };
      const imp = await tx.importacionCartera.create({
        data: {
          condominioId,
          archivo: d.archivo,
          fechaCorte: fecha(d.fechaCorte),
          filas,
          resumen,
          creadaPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.importacion_previsualizada',
        objetoTipo: 'importacion_cartera',
        objetoId: imp.id,
        condominioId,
        actorId: usuarioId,
        despues: resumen,
      });
      return { id: imp.id, estado: imp.estado, filas, resumen };
    });
  }
  async aprobarSaldos(id: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const imp = await tx.importacionCartera.findFirst({ where: { id, condominioId } });
      if (!imp) throw new NotFoundException('Importación no encontrada.');
      if (imp.estado !== 'PENDIENTE') throw new ConflictException('La importación ya fue cerrada.');
      const rows = imp.filas as {
        unidadId: string | null;
        periodo: string;
        fechaVencimiento: string;
        valor: string | number;
        descripcion?: string;
        resultado: string;
      }[];
      const validas = rows.filter((r) => r.resultado === 'VALIDA' && r.unidadId);
      if (!validas.length) throw new BadRequestException('No hay filas válidas para aprobar.');
      if (validas.length !== rows.length)
        throw new BadRequestException(
          'Corrija o elimine las filas con unidad no encontrada antes de aprobar.',
        );
      const max = await tx.obligacion.aggregate({
        where: { condominioId },
        _max: { numero: true },
      });
      let numero = max._max.numero ?? 0;
      for (const r of validas) {
        const valor = new Prisma.Decimal(String(r.valor));
        const o = await tx.obligacion.create({
          data: {
            condominioId,
            numero: ++numero,
            unidadId: r.unidadId!,
            concepto: 'SALDO_INICIAL',
            periodo: r.periodo,
            descripcion:
              r.descripcion ?? `Saldo inicial al ${imp.fechaCorte.toISOString().slice(0, 10)}`,
            fechaEmision: imp.fechaCorte,
            fechaVencimiento: fecha(r.fechaVencimiento),
            valor,
            origen: 'IMPORTACION',
            importacionId: id,
            creadoPor: usuarioId,
          },
        });
        await tx.movimientoCartera.create({
          data: {
            condominioId,
            unidadId: r.unidadId!,
            obligacionId: o.id,
            tipo: 'CARGO',
            valor,
            fecha: imp.fechaCorte,
            descripcion: 'Saldo inicial importado',
            creadoPor: usuarioId,
          },
        });
      }
      const cerrada = await tx.importacionCartera.update({
        where: { id },
        data: { estado: 'APROBADA', aprobadaPor: usuarioId, cerradaEn: new Date() },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cartera.saldos_iniciales_aprobados',
        objetoTipo: 'importacion_cartera',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: { estado: imp.estado },
        despues: { estado: cerrada.estado, filas: validas.length },
      });
      return { estado: cerrada.estado, filas: validas.length };
    });
  }
  async exportar(f: FiltrosCartera) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const rows = await this.listarTx(tx, condominioId, f);
      await this.auditoria.registrar(tx, {
        accion: 'cartera.reporte_exportado',
        objetoTipo: 'cartera',
        objetoId: condominioId,
        condominioId,
        actorId: usuarioId,
        despues: { filtros: f, filas: rows.length },
      });
      return rows;
    });
  }
}
