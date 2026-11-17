import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type EstadoRecaudo, type MedioPago, type Recaudo } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuditoriaService, type EventoAuditoria } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import type {
  FiltrosRecaudos,
  ModificarRecaudo,
  PrevisualizarImportacion,
  RegistrarRecaudo,
  VerificarRecaudo,
} from './recaudos.dto';
import {
  ErrorRegla,
  calcularImputacion,
  hoyEnBogota,
  numeroVisible,
  parsearFecha,
  parsearMedio,
  parsearValor,
  tipoArchivoReal,
} from './recaudos.reglas';

type Tx = Prisma.TransactionClient;
export type ArchivoCargado = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ResultadoFila = 'VALIDA' | 'ADVERTENCIA' | 'DUPLICADO' | 'ERROR';
export interface FilaImportacion {
  fila: number;
  resultado: ResultadoFila;
  mensajes: string[];
  datos: {
    fechaPago: string | null;
    valor: string | null;
    medio: MedioPago | null;
    unidad: string;
    unidadId: string | null;
    referencia: string | null;
    pagador: string | null;
    banco: string | null;
    observacion: string | null;
  };
}

const MSJ_SOPORTE = 'El archivo no cumple el formato o tamaño permitido.';
const MSJ_DUPLICADO = 'Encontramos un pago similar. Revise antes de continuar.';
const ABIERTOS: EstadoRecaudo[] = ['PENDIENTE', 'OBSERVADO'];

const contextoActual = () => {
  const c = contexto.actual();
  if (!c.condominioId || !c.usuarioId)
    throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId: c.condominioId, usuarioId: c.usuarioId };
};
const limpio = (v?: string | null) => v?.trim().replace(/\s+/g, ' ') || null;
const aFecha = (f: string) => new Date(`${f}T00:00:00.000Z`);
const fechaTexto = (f: Date) => f.toISOString().slice(0, 10);
const nombreArchivo = (v: string) => v.replace(/[\\/\p{Cc}]/gu, '_').slice(-180);

/** Lo que se guarda en la bitácora: datos del pago, sin contenido de archivos. */
const paraAuditoria = (r: Recaudo) => ({
  numero: numeroVisible(r.numero),
  estado: r.estado,
  fechaPago: fechaTexto(r.fechaPago),
  valor: r.valor,
  medio: r.medio,
  referencia: r.referencia,
  banco: r.banco,
  pagador: r.pagador,
  unidadId: r.unidadId,
  propietarioId: r.propietarioId,
  observacion: r.observacion,
  origen: r.origen,
  posibleDuplicado: r.posibleDuplicado,
  saldoAFavor: r.saldoAFavor,
});

const vista = <T extends Recaudo>(r: T) => ({
  ...r,
  numeroVisible: numeroVisible(r.numero),
  fechaPago: fechaTexto(r.fechaPago),
});

const INCLUIR_LISTA = {
  unidad: { select: { id: true, codigo: true, tipo: true } },
  propietario: { select: { id: true, nombre: true } },
  _count: { select: { soportes: true } },
} satisfies Prisma.RecaudoInclude;

interface ClaveDuplicado {
  valor: Prisma.Decimal;
  referencia: string | null;
  fechaPago: string;
  unidadId: string | null;
}
/** RN-03: mismo valor y misma referencia, o mismo valor, fecha y unidad. */
const clavesDuplicado = (c: ClaveDuplicado) => [
  ...(c.referencia ? [`${c.valor.toFixed(2)}|ref|${c.referencia.toLowerCase()}`] : []),
  ...(c.unidadId ? [`${c.valor.toFixed(2)}|dia|${c.fechaPago}|${c.unidadId}`] : []),
];

@Injectable()
export class RecaudosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ───────────────────────── Consulta ─────────────────────────

  private donde(condominioId: string, f: FiltrosRecaudos): Prisma.RecaudoWhereInput {
    const y: Prisma.RecaudoWhereInput[] = [];
    if (f.estado) y.push({ estado: f.estado });
    if (f.medio) y.push({ medio: f.medio });
    if (f.unidadId) y.push({ unidadId: f.unidadId });
    if (f.propietarioId) {
      y.push({
        OR: [
          { propietarioId: f.propietarioId },
          { unidad: { titularidades: { some: { propietarioId: f.propietarioId, hasta: null } } } },
        ],
      });
    }
    if (f.desde) y.push({ fechaPago: { gte: aFecha(f.desde) } });
    if (f.hasta) y.push({ fechaPago: { lte: aFecha(f.hasta) } });
    if (f.bandeja === 'identificar') y.push({ unidadId: null, estado: { in: ABIERTOS } });
    if (f.bandeja === 'revision') {
      y.push({ OR: [{ estado: 'OBSERVADO' }, { unidadId: null, estado: 'PENDIENTE' }] });
    }
    const buscar = limpio(f.buscar);
    if (buscar) {
      const contiene = { contains: buscar, mode: 'insensitive' as const };
      const numero = /^(?:rc-?)?0*(\d{1,9})$/i.exec(buscar);
      y.push({
        OR: [
          { pagador: contiene },
          { referencia: contiene },
          { banco: contiene },
          { unidad: { codigo: contiene } },
          { propietario: { nombre: contiene } },
          ...(numero ? [{ numero: Number(numero[1]) }] : []),
        ],
      });
    }
    return { condominioId, AND: y };
  }

  async listar(filtros: FiltrosRecaudos) {
    const { condominioId } = contextoActual();
    const where = this.donde(condominioId, filtros);
    return this.prisma.withTenant(condominioId, async (tx) => {
      const [items, porEstado, sinIdentificar] = await Promise.all([
        tx.recaudo.findMany({
          where,
          include: INCLUIR_LISTA,
          orderBy: [{ fechaPago: 'desc' }, { numero: 'desc' }],
          take: 500,
        }),
        tx.recaudo.groupBy({
          by: ['estado'],
          where,
          _count: { _all: true },
          _sum: { valor: true, saldoAFavor: true },
        }),
        tx.recaudo.count({ where: { AND: [where, { unidadId: null, estado: { in: ABIERTOS } }] } }),
      ]);
      const de = (e: EstadoRecaudo) => porEstado.find((g) => g.estado === e);
      const cero = new Prisma.Decimal(0);
      const vigentes = porEstado.filter((g) => g.estado !== 'ANULADO');
      return {
        items: items.map(vista),
        resumen: {
          total: porEstado.reduce((n, g) => n + g._count._all, 0),
          // Los anulados no cuentan como dinero recibido.
          valorRecibido: vigentes.reduce((s, g) => s.plus(g._sum.valor ?? 0), cero),
          valorVerificado: de('VERIFICADO')?._sum.valor ?? cero,
          saldoAFavor: de('VERIFICADO')?._sum.saldoAFavor ?? cero,
          pendientes: de('PENDIENTE')?._count._all ?? 0,
          observados: de('OBSERVADO')?._count._all ?? 0,
          verificados: de('VERIFICADO')?._count._all ?? 0,
          anulados: de('ANULADO')?._count._all ?? 0,
          sinIdentificar,
        },
      };
    });
  }

  async exportar(filtros: FiltrosRecaudos) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const items = await tx.recaudo.findMany({
        where: this.donde(condominioId, filtros),
        include: INCLUIR_LISTA,
        orderBy: [{ fechaPago: 'asc' }, { numero: 'asc' }],
        take: 10_000,
      });
      await this.auditoria.registrar(tx, {
        accion: 'recaudos.exportados',
        objetoTipo: 'recaudo',
        condominioId,
        actorId: usuarioId,
        despues: { filtros, registros: items.length },
      });
      return { items: items.map(vista) };
    });
  }

  private async cargarDetalle(tx: Tx, condominioId: string, id: string) {
    const r = await tx.recaudo.findFirst({
      where: { id, condominioId },
      include: {
        unidad: { select: { id: true, codigo: true, tipo: true } },
        propietario: { select: { id: true, nombre: true } },
        imputaciones: { orderBy: [{ periodo: 'asc' }, { concepto: 'asc' }] },
        soportes: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            nombre: true,
            mimeType: true,
            tamano: true,
            sha256: true,
            creadoPor: true,
            createdAt: true,
          },
        },
      },
    });
    if (!r) throw new NotFoundException('Pago no encontrado.');
    const bitacora = await tx.auditoria.findMany({
      where: { condominioId, objetoTipo: 'recaudo', objetoId: id },
      orderBy: { id: 'asc' },
      take: 300,
    });
    const ids = [
      r.creadoPor,
      r.revisadoPor,
      r.anuladoPor,
      ...bitacora.map((b) => b.actorId),
    ].filter((v): v is string => !!v);
    const usuarios = await tx.usuario.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nombre: true },
    });
    const nombre = (uid: string | null) =>
      uid ? (usuarios.find((u) => u.id === uid)?.nombre ?? 'Usuario') : null;
    return {
      ...vista(r),
      creadoPorNombre: nombre(r.creadoPor),
      revisadoPorNombre: nombre(r.revisadoPor),
      anuladoPorNombre: nombre(r.anuladoPor),
      imputaciones: r.imputaciones.map((i) => ({
        ...i,
        saldoPendiente: i.valorObligacion ? i.valorObligacion.minus(i.valorAplicado) : null,
      })),
      historial: bitacora.map((b) => ({
        id: String(b.id),
        accion: b.accion,
        actor: nombre(b.actorId) ?? 'Sistema',
        antes: b.antes,
        despues: b.despues,
        createdAt: b.createdAt,
      })),
    };
  }

  async detalle(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, (tx) => this.cargarDetalle(tx, condominioId, id));
  }

  // ───────────────────────── Registro ─────────────────────────

  private async validarVinculos(
    tx: Tx,
    condominioId: string,
    unidadId?: string | null,
    propietarioId?: string | null,
  ) {
    if (unidadId) {
      const u = await tx.unidadPrivada.findFirst({
        where: { id: unidadId, condominioId },
        select: { id: true },
      });
      if (!u) throw new NotFoundException('Unidad no encontrada.');
    }
    if (propietarioId) {
      const p = await tx.propietario.findFirst({
        where: { id: propietarioId, condominioId },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Propietario no encontrado.');
    }
  }

  private async buscarDuplicados(
    tx: Tx,
    condominioId: string,
    c: ClaveDuplicado,
    excluirId?: string,
  ) {
    const o: Prisma.RecaudoWhereInput[] = [];
    if (c.referencia) o.push({ referencia: { equals: c.referencia, mode: 'insensitive' } });
    if (c.unidadId) o.push({ fechaPago: aFecha(c.fechaPago), unidadId: c.unidadId });
    if (o.length === 0) return [];
    const encontrados = await tx.recaudo.findMany({
      where: {
        condominioId,
        estado: { not: 'ANULADO' },
        valor: c.valor,
        OR: o,
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { numero: 'asc' },
      take: 5,
    });
    return encontrados.map((d) => ({
      id: d.id,
      numeroVisible: numeroVisible(d.numero),
      fechaPago: fechaTexto(d.fechaPago),
      valor: d.valor,
      referencia: d.referencia,
      estado: d.estado,
      unidad: d.unidad?.codigo ?? null,
    }));
  }

  /** Consecutivo por condominio; el bloqueo evita números repetidos entre registros simultáneos. */
  private async siguienteNumero(tx: Tx, condominioId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recaudo:${condominioId}`}, 0))`;
    const { _max } = await tx.recaudo.aggregate({
      where: { condominioId },
      _max: { numero: true },
    });
    return (_max.numero ?? 0) + 1;
  }

  async registrar(datos: RegistrarRecaudo) {
    const { condominioId, usuarioId } = contextoActual();
    const valor = parsearValor(datos.valor)!;
    const referencia = limpio(datos.referencia);
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.validarVinculos(tx, condominioId, datos.unidadId, datos.propietarioId);
      const duplicados = await this.buscarDuplicados(tx, condominioId, {
        valor,
        referencia,
        fechaPago: datos.fechaPago,
        unidadId: datos.unidadId ?? null,
      });
      if (duplicados.length > 0 && !datos.confirmarDuplicado) {
        throw new ConflictException({ mensaje: MSJ_DUPLICADO, duplicados });
      }
      const creado = await tx.recaudo.create({
        data: {
          condominioId,
          numero: await this.siguienteNumero(tx, condominioId),
          unidadId: datos.unidadId ?? null,
          propietarioId: datos.propietarioId ?? null,
          pagador: limpio(datos.pagador),
          fechaPago: aFecha(datos.fechaPago),
          valor,
          medio: datos.medio,
          referencia,
          banco: limpio(datos.banco),
          observacion: datos.observacion?.trim() || null,
          posibleDuplicado: duplicados.length > 0,
          creadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.registrado',
        objetoTipo: 'recaudo',
        objetoId: creado.id,
        condominioId,
        actorId: usuarioId,
        despues: {
          ...paraAuditoria(creado),
          ...(duplicados.length
            ? { similaresConfirmados: duplicados.map((d) => d.numeroVisible) }
            : {}),
        },
      });
      return vista(creado);
    });
  }

  private async abierto(tx: Tx, condominioId: string, id: string) {
    const r = await tx.recaudo.findFirst({ where: { id, condominioId } });
    if (!r) throw new NotFoundException('Pago no encontrado.');
    if (r.estado === 'ANULADO') throw new ConflictException('Un pago anulado no admite cambios.');
    if (r.estado === 'VERIFICADO') {
      throw new ConflictException(
        'Un pago verificado no se modifica: anúlelo y registre uno nuevo.',
      );
    }
    return r;
  }

  async modificar(id: string, datos: ModificarRecaudo) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await this.abierto(tx, condominioId, id);
      await this.validarVinculos(tx, condominioId, datos.unidadId, datos.propietarioId);
      const actualizado = await tx.recaudo.update({
        where: { id },
        data: {
          ...(datos.fechaPago !== undefined ? { fechaPago: aFecha(datos.fechaPago) } : {}),
          ...(datos.valor !== undefined ? { valor: parsearValor(datos.valor)! } : {}),
          ...(datos.medio !== undefined ? { medio: datos.medio } : {}),
          ...(datos.referencia !== undefined ? { referencia: limpio(datos.referencia) } : {}),
          ...(datos.banco !== undefined ? { banco: limpio(datos.banco) } : {}),
          ...(datos.pagador !== undefined ? { pagador: limpio(datos.pagador) } : {}),
          ...(datos.observacion !== undefined
            ? { observacion: datos.observacion?.trim() || null }
            : {}),
          ...(datos.unidadId !== undefined ? { unidadId: datos.unidadId } : {}),
          ...(datos.propietarioId !== undefined ? { propietarioId: datos.propietarioId } : {}),
        },
      });
      await this.auditoria.registrar(tx, {
        accion:
          !anterior.unidadId && actualizado.unidadId
            ? 'recaudo.identificado'
            : 'recaudo.modificado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: paraAuditoria(anterior),
        despues: paraAuditoria(actualizado),
      });
      return this.cargarDetalle(tx, condominioId, id);
    });
  }

  // ───────────────────────── Soportes ─────────────────────────

  async subirSoporte(id: string, archivo: ArchivoCargado) {
    const tipo = tipoArchivoReal(archivo.buffer);
    // El tipo se decide por el contenido real; el declarado debe coincidir.
    if (!tipo || tipo !== archivo.mimetype) throw new BadRequestException(MSJ_SOPORTE);
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const r = await tx.recaudo.findFirst({
        where: { id, condominioId },
        select: { estado: true },
      });
      if (!r) throw new NotFoundException('Pago no encontrado.');
      if (r.estado === 'ANULADO') throw new ConflictException('Un pago anulado no admite cambios.');
      const soporte = await tx.soporteRecaudo.create({
        data: {
          condominioId,
          recaudoId: id,
          nombre: nombreArchivo(archivo.originalname),
          mimeType: tipo,
          tamano: archivo.buffer.length,
          sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
          contenido: Uint8Array.from(archivo.buffer),
          creadoPor: usuarioId,
        },
        select: {
          id: true,
          nombre: true,
          mimeType: true,
          tamano: true,
          sha256: true,
          creadoPor: true,
          createdAt: true,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.soporte_cargado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        despues: {
          soporteId: soporte.id,
          nombre: soporte.nombre,
          mimeType: tipo,
          tamano: soporte.tamano,
          sha256: soporte.sha256,
        },
      });
      return soporte;
    });
  }

  async obtenerSoporte(id: string, soporteId: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const s = await tx.soporteRecaudo.findFirst({
        where: { id: soporteId, recaudoId: id, condominioId },
      });
      if (!s) throw new NotFoundException('Soporte no encontrado.');
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.soporte_consultado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        despues: { soporteId: s.id, nombre: s.nombre },
      });
      return {
        id: s.id,
        nombre: s.nombre,
        mimeType: s.mimeType,
        sha256: s.sha256,
        contenido: Buffer.from(s.contenido).toString('base64'),
      };
    });
  }

  // ─────────────────── Verificación y anulación ───────────────────

  async verificar(id: string, datos: VerificarRecaudo) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await this.abierto(tx, condominioId, id);
      if (!anterior.unidadId) {
        // RN-04: un pago sin identificar no afecta la cartera.
        throw new ConflictException(
          'Asigne la unidad antes de verificar: el pago está por identificar.',
        );
      }
      let calculo;
      try {
        calculo = calcularImputacion(anterior.valor, datos.imputaciones);
      } catch (error) {
        if (error instanceof ErrorRegla) throw new BadRequestException(error.message);
        throw error;
      }
      // La condición de estado evita una doble verificación simultánea.
      const cambio = await tx.recaudo.updateMany({
        where: { id, condominioId, estado: { in: ABIERTOS } },
        data: {
          estado: 'VERIFICADO',
          saldoAFavor: calculo.saldoAFavor,
          observacionVerificacion: datos.observacion?.trim() || null,
          revisadoPor: usuarioId,
          revisadoEn: new Date(),
        },
      });
      if (cambio.count !== 1)
        throw new ConflictException('El pago ya fue revisado por otra persona.');
      for (const l of calculo.lineas) {
        const obligacion = await tx.obligacion.findFirst({
          where: {
            condominioId,
            unidadId: anterior.unidadId,
            periodo: l.periodo,
            concepto:
              l.concepto === 'CUOTA_VENCIDA'
                ? { in: ['CUOTA_VENCIDA', 'CUOTA_ADMINISTRACION'] }
                : l.concepto,
          },
          include: { movimientos: { select: { tipo: true, valor: true } } },
        });
        let obligacionId: string | null = null;
        if (obligacion) {
          let saldo = new Prisma.Decimal(0);
          for (const m of obligacion.movimientos) {
            saldo = saldo.add(
              ['PAGO', 'AJUSTE_CREDITO', 'CREDITO_APLICADO'].includes(m.tipo)
                ? m.valor.negated()
                : m.valor,
            );
          }
          if (new Prisma.Decimal(String(l.valorAplicado)).gt(saldo)) {
            throw new ConflictException(
              `El valor aplicado supera el saldo real de la obligación ${obligacion.numero}.`,
            );
          }
          obligacionId = obligacion.id;
        }
        const imputacion = await tx.imputacionRecaudo.create({
          data: {
            condominioId,
            recaudoId: id,
            concepto: l.concepto,
            periodo: l.periodo,
            valorObligacion: l.valorObligacion,
            valorAplicado: l.valorAplicado,
            obligacionId,
          },
        });
        if (obligacionId)
          await tx.movimientoCartera.create({
            data: {
              condominioId,
              unidadId: anterior.unidadId,
              obligacionId,
              tipo: 'PAGO',
              valor: new Prisma.Decimal(String(l.valorAplicado)),
              fecha: anterior.fechaPago,
              recaudoId: id,
              imputacionId: imputacion.id,
              descripcion: `Pago verificado ${numeroVisible(anterior.numero)}`,
              creadoPor: usuarioId,
            },
          });
      }
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.verificado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: paraAuditoria(anterior),
        despues: {
          estado: 'VERIFICADO',
          totalAplicado: calculo.totalAplicado,
          saldoAFavor: calculo.saldoAFavor,
          imputaciones: calculo.lineas,
          observacion: datos.observacion?.trim() || null,
        },
      });
      return this.cargarDetalle(tx, condominioId, id);
    });
  }

  async observar(id: string, observacion: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await this.abierto(tx, condominioId, id);
      await tx.recaudo.update({
        where: { id },
        data: {
          estado: 'OBSERVADO',
          observacionVerificacion: observacion,
          revisadoPor: usuarioId,
          revisadoEn: new Date(),
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.observado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: { estado: anterior.estado, observacion: anterior.observacionVerificacion },
        despues: { estado: 'OBSERVADO', observacion },
      });
      return this.cargarDetalle(tx, condominioId, id);
    });
  }

  async anular(id: string, motivo: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const anterior = await tx.recaudo.findFirst({ where: { id, condominioId } });
      if (!anterior) throw new NotFoundException('Pago no encontrado.');
      const cambio = await tx.recaudo.updateMany({
        where: { id, condominioId, estado: { not: 'ANULADO' } },
        data: {
          estado: 'ANULADO',
          motivoAnulacion: motivo,
          anuladoPor: usuarioId,
          anuladoEn: new Date(),
        },
      });
      if (cambio.count !== 1) throw new ConflictException('El pago ya está anulado.');
      if (anterior.estado === 'VERIFICADO') {
        const pagosAplicados = await tx.movimientoCartera.findMany({
          where: { condominioId, recaudoId: id, tipo: 'PAGO' },
        });
        for (const pago of pagosAplicados) {
          await tx.movimientoCartera.create({
            data: {
              condominioId,
              unidadId: pago.unidadId,
              obligacionId: pago.obligacionId,
              tipo: 'REVERSO_PAGO',
              valor: pago.valor,
              fecha: new Date(),
              recaudoId: id,
              descripcion: `Reverso de pago ${numeroVisible(anterior.numero)}: ${motivo}`,
              creadoPor: usuarioId,
            },
          });
        }
      }
      await this.auditoria.registrar(tx, {
        accion: 'recaudo.anulado',
        objetoTipo: 'recaudo',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        antes: paraAuditoria(anterior),
        despues: { estado: 'ANULADO', motivo },
      });
      return this.cargarDetalle(tx, condominioId, id);
    });
  }

  // ───────────────────────── Importación ─────────────────────────

  leerArchivo(archivo: ArchivoCargado) {
    const extension = /\.(xlsx|xls|csv)$/i.exec(archivo.originalname)?.[1]?.toLowerCase();
    if (!extension) throw new BadRequestException('Use un archivo Excel (.xlsx, .xls) o CSV.');
    let filas: Record<string, unknown>[];
    try {
      // En CSV se conserva el texto tal cual para no reinterpretar fechas día/mes.
      const libro = XLSX.read(archivo.buffer, {
        type: 'buffer',
        cellDates: true,
        raw: extension === 'csv',
      });
      const hoja = libro.Sheets[libro.SheetNames[0] ?? ''];
      if (!hoja) throw new Error('sin hojas');
      filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
        defval: '',
        raw: true,
        blankrows: false,
      });
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo. Verifique que sea un Excel o CSV válido.',
      );
    }
    if (filas.length === 0) throw new BadRequestException('El archivo no tiene filas con datos.');
    if (filas.length > 2000)
      throw new BadRequestException('El archivo supera el máximo de 2.000 filas.');
    const celda = (v: unknown) =>
      v instanceof Date
        ? (parsearFecha(v) ?? '')
        : v == null
          ? ''
          : String(v).trim().slice(0, 1000);
    return {
      archivo: nombreArchivo(archivo.originalname),
      columnas: Object.keys(filas[0] ?? {}),
      filas: filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, celda(v)]))),
    };
  }

  /** Claves de duplicado de los pagos vigentes que comparten valor con las filas dadas. */
  private async clavesExistentes(tx: Tx, condominioId: string, valores: Prisma.Decimal[]) {
    if (valores.length === 0) return new Set<string>();
    const existentes = await tx.recaudo.findMany({
      where: { condominioId, estado: { not: 'ANULADO' }, valor: { in: valores } },
      select: { valor: true, referencia: true, fechaPago: true, unidadId: true },
    });
    return new Set(
      existentes.flatMap((x) => clavesDuplicado({ ...x, fechaPago: fechaTexto(x.fechaPago) })),
    );
  }

  /** RN-10: revisa cada fila y guarda un borrador. No crea ningún pago. */
  async previsualizarImportacion(entrada: PrevisualizarImportacion) {
    const { condominioId, usuarioId } = contextoActual();
    const hoy = hoyEnBogota();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const unidades = await tx.unidadPrivada.findMany({
        where: { condominioId },
        select: { id: true, codigo: true },
      });
      const porCodigo = new Map(unidades.map((u) => [u.codigo.trim().toLowerCase(), u.id]));

      const filas: FilaImportacion[] = entrada.filas.map((fila, indice) => {
        const leer = (campo: keyof PrevisualizarImportacion['columnas']) => {
          const columna = entrada.columnas[campo];
          return columna ? String(fila[columna] ?? '').trim() : '';
        };
        const mensajes: string[] = [];
        const fechaPago = parsearFecha(leer('fechaPago'));
        if (!fechaPago) mensajes.push('Fecha no válida (use DD/MM/AAAA)');
        else if (fechaPago > hoy) mensajes.push('La fecha del pago es futura');
        const valor = parsearValor(leer('valor'));
        if (!valor) mensajes.push('Valor no válido: debe ser mayor que cero');
        const medio = parsearMedio(leer('medio'));
        if (!medio) {
          mensajes.push(
            leer('medio')
              ? `Medio de pago desconocido: ${leer('medio').slice(0, 40)}`
              : 'Falta el medio de pago',
          );
        }
        const unidad = leer('unidad');
        const unidadId = unidad ? (porCodigo.get(unidad.toLowerCase()) ?? null) : null;
        if (unidad && !unidadId) mensajes.push(`La unidad ${unidad.slice(0, 60)} no existe`);
        return {
          fila: indice + 2,
          resultado: mensajes.length ? 'ERROR' : 'VALIDA',
          mensajes,
          datos: {
            fechaPago,
            valor: valor?.toString() ?? null,
            medio,
            unidad: unidad.slice(0, 60),
            unidadId,
            referencia: limpio(leer('referencia'))?.slice(0, 80) ?? null,
            pagador: limpio(leer('pagador'))?.slice(0, 180) ?? null,
            banco: limpio(leer('banco'))?.slice(0, 120) ?? null,
            observacion: leer('observacion').slice(0, 1000) || null,
          },
        };
      });

      const sinError = filas.filter((f) => f.resultado !== 'ERROR');
      const existentes = await this.clavesExistentes(
        tx,
        condominioId,
        sinError.map((f) => new Prisma.Decimal(f.datos.valor!)),
      );
      const enArchivo = new Set<string>();
      for (const f of sinError) {
        const claves = clavesDuplicado({
          valor: new Prisma.Decimal(f.datos.valor!),
          referencia: f.datos.referencia,
          fechaPago: f.datos.fechaPago!,
          unidadId: f.datos.unidadId,
        });
        if (claves.some((c) => existentes.has(c))) {
          f.resultado = 'DUPLICADO';
          f.mensajes.push('Ya existe un pago similar registrado');
        } else if (claves.some((c) => enArchivo.has(c))) {
          f.resultado = 'DUPLICADO';
          f.mensajes.push('Repetido dentro del mismo archivo');
        } else if (!f.datos.unidadId) {
          f.resultado = 'ADVERTENCIA';
          f.mensajes.push('Sin unidad: quedará por identificar');
        }
        claves.forEach((c) => enArchivo.add(c));
      }

      const cuenta = (r: ResultadoFila) => filas.filter((f) => f.resultado === r).length;
      const resumen = {
        total: filas.length,
        validas: cuenta('VALIDA'),
        advertencias: cuenta('ADVERTENCIA'),
        duplicados: cuenta('DUPLICADO'),
        errores: cuenta('ERROR'),
      };
      const borrador = await tx.importacionRecaudos.create({
        data: {
          condominioId,
          creadaPor: usuarioId,
          archivo: nombreArchivo(entrada.archivo || 'Importación de pagos'),
          filas: filas as unknown as Prisma.InputJsonValue,
          resumen,
        },
        select: { id: true, archivo: true, estado: true, creadaEn: true },
      });
      return { ...borrador, filas, resumen };
    });
  }

  async confirmarImportacion(id: string, incluirDuplicados = false) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const borrador = await tx.importacionRecaudos.findFirst({
        where: { id, condominioId, estado: 'PENDIENTE' },
      });
      if (!borrador) throw new NotFoundException('Importación pendiente no encontrada.');
      const reclamada = await tx.importacionRecaudos.updateMany({
        where: { id, condominioId, estado: 'PENDIENTE' },
        data: { estado: 'CONFIRMADA', confirmadaPor: usuarioId, cerradaEn: new Date() },
      });
      if (reclamada.count !== 1) throw new ConflictException('La importación ya fue procesada.');

      const filas = borrador.filas as unknown as FilaImportacion[];
      const candidatas = filas.filter(
        (f) => f.resultado !== 'ERROR' && f.datos.valor && f.datos.fechaPago && f.datos.medio,
      );
      let numero = await this.siguienteNumero(tx, condominioId);
      // Se revisa de nuevo: pudo registrarse un pago igual después de la vista previa.
      const existentes = await this.clavesExistentes(
        tx,
        condominioId,
        candidatas.map((f) => new Prisma.Decimal(f.datos.valor!)),
      );
      const nuevos: Prisma.RecaudoCreateManyInput[] = [];
      for (const f of candidatas) {
        const valor = new Prisma.Decimal(f.datos.valor!);
        const duplicado =
          f.resultado === 'DUPLICADO' ||
          clavesDuplicado({
            valor,
            referencia: f.datos.referencia,
            fechaPago: f.datos.fechaPago!,
            unidadId: f.datos.unidadId,
          }).some((c) => existentes.has(c));
        if (duplicado && !incluirDuplicados) continue;
        nuevos.push({
          id: randomUUID(),
          condominioId,
          numero: numero++,
          unidadId: f.datos.unidadId,
          pagador: f.datos.pagador,
          fechaPago: aFecha(f.datos.fechaPago!),
          valor,
          medio: f.datos.medio!,
          referencia: f.datos.referencia,
          banco: f.datos.banco,
          observacion: f.datos.observacion,
          origen: 'IMPORTACION',
          importacionId: id,
          posibleDuplicado: duplicado,
          creadoPor: usuarioId,
        });
      }
      if (nuevos.length === 0) throw new ConflictException('No hay filas válidas para importar.');
      try {
        await tx.recaudo.createMany({ data: nuevos });
      } catch (error) {
        // Una unidad eliminada o un vínculo roto entre la vista previa y la confirmación.
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          throw new ConflictException(
            'Los datos cambiaron desde la vista previa. Vuelva a validar el archivo.',
          );
        }
        throw error;
      }
      const eventos: EventoAuditoria[] = nuevos.map((n) => ({
        accion: 'recaudo.registrado',
        objetoTipo: 'recaudo',
        objetoId: n.id,
        condominioId,
        actorId: usuarioId,
        despues: {
          numero: numeroVisible(n.numero),
          estado: 'PENDIENTE',
          fechaPago: fechaTexto(n.fechaPago as Date),
          valor: n.valor,
          medio: n.medio,
          referencia: n.referencia,
          pagador: n.pagador,
          unidadId: n.unidadId,
          origen: 'IMPORTACION',
          importacionId: id,
          posibleDuplicado: n.posibleDuplicado,
        },
      }));
      const resultado = { creados: nuevos.length, omitidos: filas.length - nuevos.length };
      eventos.push({
        accion: 'recaudos.importacion_confirmada',
        objetoTipo: 'importacion_recaudos',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
        despues: { archivo: borrador.archivo, ...resultado, incluirDuplicados },
      });
      await this.auditoria.registrarVarios(tx, eventos);
      return resultado;
    });
  }

  async descartarImportacion(id: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const cambio = await tx.importacionRecaudos.updateMany({
        where: { id, condominioId, estado: 'PENDIENTE' },
        data: { estado: 'DESCARTADA', cerradaEn: new Date(), filas: [] },
      });
      if (cambio.count !== 1) throw new NotFoundException('Importación pendiente no encontrada.');
      await this.auditoria.registrar(tx, {
        accion: 'recaudos.importacion_descartada',
        objetoTipo: 'importacion_recaudos',
        objetoId: id,
        condominioId,
        actorId: usuarioId,
      });
      return { estado: 'DESCARTADA' };
    });
  }
}
