import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Mailer } from '../auth/mailer';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import { signoDe } from '../cartera/cartera.reglas';
import type {
  crearEnvioCuentaCobro,
  crearPeriodoCobro,
  anularCuentaCobro,
} from './cuentas-cobro.dto';
import type { z } from 'zod';

type CrearPeriodo = z.infer<typeof crearPeriodoCobro>;
type CrearEnvio = z.infer<typeof crearEnvioCuentaCobro>;
type Anular = z.infer<typeof anularCuentaCobro>;
const DECIMAL_CERO = new Prisma.Decimal(0);
const CONCEPTO: Record<string, string> = {
  CUOTA_ADMINISTRACION: 'Cuota de administración',
  CUOTA_VENCIDA: 'Cuota vencida',
  INTERESES: 'Intereses',
  CUOTA_EXTRAORDINARIA: 'Cuota extraordinaria',
  OTRO: 'Otros conceptos',
  SALDO_INICIAL: 'Saldo inicial',
};
const dinero = (v: Prisma.Decimal | string | number) => {
  const [entero = '0', centavos = '00'] = new Prisma.Decimal(v).toFixed(2).split('.');
  return `$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
};
const fechaLocal = (d: Date) => d.toISOString().slice(0, 10);
const ctx = () => {
  const { condominioId, usuarioId } = contexto.actual();
  if (!condominioId || !usuarioId) throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId, usuarioId };
};

@Injectable()
export class CuentasCobroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly mailer: Mailer,
  ) {}

  async listar() {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const [periodos, cuentas] = await Promise.all([
        tx.periodoCobro.findMany({
          where: { condominioId },
          include: {
            conceptos: { where: { activo: true } },
            _count: { select: { cuentas: true } },
          },
          orderBy: { periodo: 'desc' },
        }),
        tx.cuentaCobro.findMany({
          where: { condominioId },
          include: {
            periodo: { select: { periodo: true, fechaCorte: true, fechaVencimiento: true } },
            unidad: {
              select: {
                codigo: true,
                tipo: true,
                titularidades: {
                  where: { hasta: null, estado: 'VALIDADO' },
                  select: { propietario: { select: { id: true, nombre: true, correo: true } } },
                },
              },
            },
            envios: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);
      return {
        periodos: periodos.map((p) => ({
          ...p,
          fechaCorte: fechaLocal(p.fechaCorte),
          fechaVencimiento: fechaLocal(p.fechaVencimiento),
        })),
        cuentas: cuentas.map((c) => ({
          id: c.id,
          numero: c.numero ? `CC-${String(c.numero).padStart(6, '0')}` : null,
          estado: c.estado,
          version: c.version,
          pdfDisponible: c.pdf !== null,
          periodo: c.periodo.periodo,
          fechaCorte: fechaLocal(c.periodo.fechaCorte),
          fechaVencimiento: fechaLocal(c.periodo.fechaVencimiento),
          unidad: c.unidad,
          total: c.total.toFixed(2),
          snapshot: c.snapshot,
          emitidoEn: c.emitidoEn?.toISOString() ?? null,
          aprobadoEn: c.aprobadoEn?.toISOString() ?? null,
          envios: c.envios,
        })),
      };
    });
  }

  async crearPeriodo(dto: CrearPeriodo) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const existente = await tx.periodoCobro.findFirst({
        where: { condominioId, periodo: dto.periodo },
      });
      if (existente) throw new ConflictException('Ya existe configuración para este periodo.');
      const p = await tx.periodoCobro.create({
        data: {
          id: randomUUID(),
          condominioId,
          periodo: dto.periodo,
          fechaCorte: new Date(`${dto.fechaCorte}T12:00:00Z`),
          fechaVencimiento: new Date(`${dto.fechaVencimiento}T12:00:00Z`),
          creadoPor: usuarioId,
          conceptos: {
            create: dto.conceptos.map((x) => ({
              id: randomUUID(),
              condominioId,
              nombre: x.nombre,
              descripcion: x.descripcion,
              creadoPor: usuarioId,
            })),
          },
        },
        include: { conceptos: true },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cuentas_cobro.periodo_creado',
        objetoTipo: 'periodo_cobro',
        objetoId: p.id,
        condominioId,
        despues: {
          periodo: p.periodo,
          fechaCorte: dto.fechaCorte,
          fechaVencimiento: dto.fechaVencimiento,
          conceptos: p.conceptos.map((c) => c.nombre),
        },
      });
      return p;
    });
  }

  async generar(periodoId: string, unidadId?: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cuentas-cobro:${condominioId}:${periodoId}`}, 0))`;
      const periodo = await tx.periodoCobro.findFirst({
        where: { id: periodoId, condominioId },
        include: { conceptos: { where: { activo: true } } },
      });
      if (!periodo) throw new NotFoundException('Periodo de cobro no encontrado.');
      if (!periodo.conceptos.length)
        throw new BadRequestException(
          'Configure al menos un concepto autorizado antes de generar cuentas.',
        );
      if (periodo.estado === 'CERRADO') throw new ConflictException('El periodo está cerrado.');
      const [unidades, previas] = await Promise.all([
        tx.unidadPrivada.findMany({
          where: { condominioId, activa: true, ...(unidadId ? { id: unidadId } : {}) },
          include: {
            titularidades: {
              where: { hasta: null, estado: 'VALIDADO' },
              include: { propietario: { select: { id: true, nombre: true, correo: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { codigo: 'asc' },
        }),
        tx.cuentaCobro.findMany({
          where: { condominioId, periodoId, estado: { not: 'ANULADO' } },
          select: { unidadId: true },
        }),
      ]);
      const condominio = await tx.condominio.findFirst({
        where: { id: condominioId },
        select: { razonSocial: true, nit: true },
      });
      const pagosPendientes = await tx.recaudo.findMany({
        where: {
          condominioId,
          unidadId: { in: unidades.map((u) => u.id) },
          estado: 'PENDIENTE',
          fechaPago: { lte: periodo.fechaCorte },
        },
        select: { unidadId: true },
      });
      const pendientesPorUnidad = new Set(
        pagosPendientes.map((p) => p.unidadId).filter((v): v is string => !!v),
      );
      const yaCreadas = new Set(previas.map((x) => x.unidadId));
      const obligaciones = await tx.obligacion.findMany({
        where: { condominioId, fechaEmision: { lte: periodo.fechaCorte } },
        include: {
          movimientos: {
            where: { fecha: { lte: periodo.fechaCorte } },
            orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ unidadId: 'asc' }, { periodo: 'asc' }],
      });
      const porUnidad = new Map<string, typeof obligaciones>();
      for (const o of obligaciones) {
        const lista = porUnidad.get(o.unidadId) ?? [];
        lista.push(o);
        porUnidad.set(o.unidadId, lista);
      }
      let creadas = 0;
      let duplicadas = 0;
      let sinSaldo = 0;
      let observadas = 0;
      for (const unidad of unidades) {
        if (yaCreadas.has(unidad.id)) {
          duplicadas++;
          continue;
        }
        const abiertas = (porUnidad.get(unidad.id) ?? [])
          .map((o) => {
            const saldo = o.movimientos.reduce(
              (s, m) => s.plus(m.valor.mul(signoDe(m.tipo))),
              DECIMAL_CERO,
            );
            return { o, saldo };
          })
          .filter((x) => x.saldo.gt(0));
        if (!abiertas.length) {
          sinSaldo++;
          continue;
        }
        const titularidades = unidad.titularidades;
        const lineas = abiertas.map(({ o, saldo }) => ({
          obligacionId: o.id,
          concepto: CONCEPTO[o.concepto] ?? o.concepto,
          codigoConcepto: o.concepto,
          periodo: o.periodo,
          descripcion: o.descripcion,
          valorOriginal: o.valor.toFixed(2),
          saldo: saldo.toFixed(2),
          clase: o.periodo < periodo.periodo ? 'SALDO_ANTERIOR' : 'PERIODO_ACTUAL',
        }));
        const total = lineas.reduce((s, x) => s.plus(x.saldo), DECIMAL_CERO);
        const snapshot = {
          condominio: condominio?.razonSocial ?? 'Copropiedad',
          nit: condominio?.nit ?? '',
          unidad: { id: unidad.id, codigo: unidad.codigo, tipo: unidad.tipo },
          propietarios: titularidades.map((t) => ({
            id: t.propietario.id,
            nombre: t.propietario.nombre,
            correo: t.propietario.correo,
          })),
          periodo: periodo.periodo,
          fechaCorte: fechaLocal(periodo.fechaCorte),
          fechaVencimiento: fechaLocal(periodo.fechaVencimiento),
          lineas,
          total: total.toFixed(2),
          observaciones: [
            ...(!titularidades.length
              ? ['No hay titularidad validada vigente al generar la cuenta.']
              : []),
            ...(pendientesPorUnidad.has(unidad.id)
              ? [
                  'Hay recaudos pendientes de verificar al corte; concilie cartera antes de aprobar.',
                ]
              : []),
          ],
        };
        const account = await tx.cuentaCobro.create({
          data: {
            id: randomUUID(),
            condominioId,
            periodoId,
            unidadId: unidad.id,
            estado: 'PENDIENTE_APROBACION',
            snapshot,
            total,
            generadoPor: usuarioId,
          },
        });
        await this.auditoria.registrar(tx, {
          accion: 'cuentas_cobro.borrador_generado',
          objetoTipo: 'cuenta_cobro',
          objetoId: account.id,
          condominioId,
          despues: {
            periodo: periodo.periodo,
            unidad: unidad.codigo,
            total: total.toFixed(2),
            obligaciones: lineas.length,
          },
        });
        creadas++;
        if (!titularidades.length || pendientesPorUnidad.has(unidad.id)) observadas++;
      }
      await tx.periodoCobro.update({
        where: { id: periodo.id },
        data: { estado: 'BORRADORES_GENERADOS' },
      });
      return { creadas, duplicadas, sinSaldo, observadas, periodo: periodo.periodo };
    });
  }

  async aprobar(id: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const cuenta = await tx.cuentaCobro.findFirst({ where: { id, condominioId } });
      if (!cuenta) throw new NotFoundException('Cuenta de cobro no encontrada.');
      if (cuenta.estado !== 'PENDIENTE_APROBACION')
        throw new ConflictException('Solo se pueden aprobar cuentas pendientes de aprobación.');
      const snapshot = cuenta.snapshot as { observaciones?: string[] };
      if (snapshot.observaciones?.length)
        throw new BadRequestException('Corrija las observaciones de titularidad antes de aprobar.');
      const actualizada = await tx.cuentaCobro.update({
        where: { id },
        data: { estado: 'APROBADO', aprobadoPor: usuarioId, aprobadoEn: new Date() },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cuentas_cobro.aprobada',
        objetoTipo: 'cuenta_cobro',
        objetoId: id,
        condominioId,
        antes: { estado: cuenta.estado },
        despues: { estado: actualizada.estado },
      });
      return { id, estado: actualizada.estado };
    });
  }

  async emitir(id: string) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cuentas-cobro-consecutivo:${condominioId}`}, 0))`;
      const cuenta = await tx.cuentaCobro.findFirst({
        where: { id, condominioId },
        include: { periodo: true, unidad: true, condominio: true },
      });
      if (!cuenta) throw new NotFoundException('Cuenta de cobro no encontrada.');
      if (cuenta.estado !== 'APROBADO')
        throw new ConflictException('La cuenta debe estar aprobada antes de emitir.');
      const snapshot = cuenta.snapshot as {
        condominio: string;
        nit: string;
        unidad: { codigo: string; tipo: string };
        propietarios: { nombre: string; correo: string | null }[];
        periodo: string;
        fechaCorte: string;
        fechaVencimiento: string;
        lineas: { concepto: string; periodo: string; saldo: string; clase: string }[];
        total: string;
        observaciones: string[];
      };
      const numero =
        (await tx.cuentaCobro.aggregate({ where: { condominioId }, _max: { numero: true } }))._max
          .numero ?? 0;
      const siguiente = numero + 1;
      const pdf = await this.generarPdf({
        ...snapshot,
        numero: `CC-${String(siguiente).padStart(6, '0')}`,
        condominio: cuenta.condominio.razonSocial,
        nit: cuenta.condominio.nit,
      });
      const pdfAlmacenado = new Uint8Array(pdf.byteLength);
      pdfAlmacenado.set(pdf);
      const actualizada = await tx.cuentaCobro.update({
        where: { id },
        data: {
          estado: 'EMITIDO',
          numero: siguiente,
          emitidoPor: usuarioId,
          emitidoEn: new Date(),
          pdf: pdfAlmacenado,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cuentas_cobro.emitida',
        objetoTipo: 'cuenta_cobro',
        objetoId: id,
        condominioId,
        antes: { estado: cuenta.estado },
        despues: {
          estado: actualizada.estado,
          numero: siguiente,
          sha256: createHash('sha256').update(pdf).digest('hex'),
        },
      });
      return { id, estado: actualizada.estado, numero: `CC-${String(siguiente).padStart(6, '0')}` };
    });
  }

  private generarPdf(d: {
    numero: string;
    condominio: string;
    nit: string;
    unidad: { codigo: string; tipo: string };
    propietarios: { nombre: string; correo: string | null }[];
    periodo: string;
    fechaCorte: string;
    fechaVencimiento: string;
    lineas: { concepto: string; periodo: string; saldo: string; clase: string }[];
    total: string;
  }) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 48,
        info: { Title: `Cuenta de cobro ${d.numero}`, Author: d.condominio },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (b: Buffer) => chunks.push(b));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc
        .fontSize(10)
        .fillColor('#14522f')
        .text('ZULU ADMIN · MAJAGUA DIGITAL', { characterSpacing: 0.6 });
      doc.moveDown(1).fontSize(20).fillColor('#142019').text('CUENTA DE COBRO');
      doc
        .moveDown(0.4)
        .fontSize(11)
        .text(d.condominio)
        .text(`NIT: ${d.nit}`)
        .text(`Documento: ${d.numero}`);
      doc
        .moveDown()
        .text(
          `Propietario(s): ${d.propietarios.map((p) => p.nombre).join(', ') || 'Titular pendiente de validar'}`,
        );
      doc.text(`Unidad: ${d.unidad.tipo === 'VILLA' ? 'Villa' : 'Lote'} ${d.unidad.codigo}`);
      doc.text(
        `Periodo: ${d.periodo}    Fecha de corte: ${d.fechaCorte}    Vencimiento: ${d.fechaVencimiento}`,
      );
      doc
        .moveDown()
        .fillColor('#14522f')
        .text('CONCEPTO', 48, doc.y, { continued: true })
        .text('PERIODO', 330, doc.y, { continued: true })
        .text('VALOR', 440, doc.y, { align: 'right' });
      doc
        .moveTo(48, doc.y + 5)
        .lineTo(564, doc.y + 5)
        .strokeColor('#dfe5e1')
        .stroke();
      doc.moveDown(0.6).fillColor('#142019');
      for (const l of d.lineas) {
        const y = doc.y;
        doc
          .text(l.concepto, 48, y, { width: 270, continued: true })
          .text(l.periodo, 330, y, { continued: true })
          .text(dinero(l.saldo), 430, y, { width: 134, align: 'right' });
        doc.moveDown(0.4);
      }
      doc
        .moveDown()
        .fontSize(14)
        .fillColor('#14522f')
        .text(`TOTAL A PAGAR: ${dinero(d.total)}`, { align: 'right' });
      doc
        .moveDown(2)
        .fontSize(9)
        .fillColor('#5b6a61')
        .text(
          'Documento administrativo de cobro. No constituye factura electrónica tributaria. Los valores reflejan obligaciones y movimientos verificados registrados en cartera al corte indicado.',
        );
      doc.end();
    });
  }

  async pdf(id: string) {
    const { condominioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const c = await tx.cuentaCobro.findFirst({
        where: { id, condominioId, estado: { in: ['EMITIDO', 'ANULADO'] } },
        select: { numero: true, pdf: true },
      });
      if (!c?.pdf || !c.numero) throw new NotFoundException('PDF emitido no encontrado.');
      return {
        nombre: `cuenta-cobro-CC-${String(c.numero).padStart(6, '0')}.pdf`,
        contenido: Buffer.from(c.pdf),
      };
    });
  }

  async registrarEnvio(id: string, dto: CrearEnvio) {
    const { condominioId, usuarioId } = ctx();
    const resultado = await this.prisma.withTenant(condominioId, async (tx) => {
      const cuenta = await tx.cuentaCobro.findFirst({
        where: { id, condominioId, estado: 'EMITIDO' },
        include: {
          unidad: {
            include: {
              titularidades: {
                where: { hasta: null, estado: 'VALIDADO' },
                include: { propietario: true },
              },
            },
          },
        },
      });
      if (!cuenta) throw new NotFoundException('Cuenta emitida no encontrada.');
      if (
        dto.canal === 'CORREO' &&
        !cuenta.unidad.titularidades.some((t) => t.propietario.correo === dto.destinatario)
      )
        throw new BadRequestException(
          'El destinatario no coincide con un correo validado del titular.',
        );
      if (dto.canal === 'CORREO' && !cuenta.pdf)
        throw new ConflictException('El PDF emitido no está disponible.');
      const envio = await tx.envioCuentaCobro.create({
        data: {
          id: randomUUID(),
          condominioId,
          cuentaId: id,
          canal: dto.canal,
          destinatario: dto.destinatario,
          estado: 'PENDIENTE',
          detalle:
            dto.canal === 'CORREO'
              ? 'Envío en proceso.'
              : 'Entrega manual pendiente de confirmación.',
          enviadoPor: usuarioId,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cuentas_cobro.envio_registrado',
        objetoTipo: 'envio_cuenta_cobro',
        objetoId: envio.id,
        condominioId,
        despues: {
          cuentaId: id,
          canal: envio.canal,
          estado: envio.estado,
          destinatario: envio.destinatario,
        },
      });
      return { envio, cuenta };
    });
    if (dto.canal !== 'CORREO') return resultado.envio;
    const snapshot = resultado.cuenta.snapshot as {
      numero?: string;
      periodo: string;
      total: string;
    };
    let estado: 'ENVIADO' | 'FALLIDO' = 'ENVIADO';
    let detalle = 'El servidor SMTP aceptó el mensaje.';
    try {
      await this.mailer.enviar({
        para: dto.destinatario,
        asunto: `Cuenta de cobro ${snapshot.periodo} · ${resultado.cuenta.unidad.codigo}`,
        texto: `Adjuntamos la cuenta de cobro del periodo ${snapshot.periodo} para la unidad ${resultado.cuenta.unidad.codigo}. Total: ${dinero(snapshot.total)}.`,
        adjuntos: [
          {
            nombre: `cuenta-cobro-CC-${String(resultado.cuenta.numero).padStart(6, '0')}.pdf`,
            mimeType: 'application/pdf',
            contenido: Buffer.from(resultado.cuenta.pdf!),
          },
        ],
      });
    } catch {
      estado = 'FALLIDO';
      detalle =
        'No fue posible entregar el mensaje al servidor SMTP. Revise la configuración y vuelva a intentar.';
    }
    return this.prisma.withTenant(condominioId, async (tx) => {
      const envio = await tx.envioCuentaCobro.update({
        where: { id: resultado.envio.id },
        data: { estado, detalle, enviadoEn: estado === 'ENVIADO' ? new Date() : null },
      });
      await this.auditoria.registrar(tx, {
        accion:
          estado === 'ENVIADO' ? 'cuentas_cobro.envio_aceptado' : 'cuentas_cobro.envio_fallido',
        objetoTipo: 'envio_cuenta_cobro',
        objetoId: envio.id,
        condominioId,
        antes: { estado: 'PENDIENTE' },
        despues: { estado, canal: 'CORREO' },
      });
      return envio;
    });
  }

  async anular(id: string, dto: Anular) {
    const { condominioId, usuarioId } = ctx();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const cuenta = await tx.cuentaCobro.findFirst({ where: { id, condominioId } });
      if (!cuenta) throw new NotFoundException('Cuenta de cobro no encontrada.');
      if (cuenta.estado === 'ANULADO') throw new ConflictException('La cuenta ya está anulada.');
      const anulada = await tx.cuentaCobro.update({
        where: { id },
        data: {
          estado: 'ANULADO',
          anuladoPor: usuarioId,
          anuladoEn: new Date(),
          motivoAnulacion: dto.motivo,
        },
      });
      await this.auditoria.registrar(tx, {
        accion: 'cuentas_cobro.anulada',
        objetoTipo: 'cuenta_cobro',
        objetoId: id,
        condominioId,
        antes: { estado: cuenta.estado, numero: cuenta.numero },
        despues: { estado: anulada.estado, motivo: dto.motivo, numero: cuenta.numero },
      });
      return { id, estado: anulada.estado };
    });
  }
}
