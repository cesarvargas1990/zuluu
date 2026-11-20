import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { contexto } from '../contexto/contexto-solicitud';
import { PrismaService } from '../prisma/prisma.service';
import { evaluarPermiso } from '../autorizacion/evaluar-permiso';
import type { ActualizarObligacion, ActualizarProceso, CambiarEstadoProceso, CrearActuacion, CrearFinanza, CrearObligacion } from './ambiental.dto';

type Archivo = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const TIPOS_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const BASE = [
  { codigo: 'AG-001', titulo: 'Concesión de aguas · Quebrada Yerbabuena', antecedente: 'Auto de desistimiento de renovación fechado 06/08/2026 (antecedente documental por verificar).', proximoPaso: 'Solicitar acto íntegro, notificación, ejecutoria y verificar concesión anterior.' },
  { codigo: 'AG-002', titulo: 'Ocupación de cauce y bocatoma', antecedente: 'Visita CVC programada para 15/10/2026; resultado oficial no acreditado.', proximoPaso: 'Obtener acta y concepto técnico de visita; cotejar planos y obras.' },
  { codigo: 'AG-003', titulo: 'Captación, acueducto y PTAP', antecedente: 'Diseños de captación, desarenador y acueducto disponibles; ejecución y calidad por verificar.', proximoPaso: 'Inspeccionar instalaciones, mantenimiento y calidad de agua.' },
  { codigo: 'AG-004', titulo: 'PTAR · tratamiento de aguas residuales', antecedente: 'Cuatro planos recuperados; conformidad con obras y operación sin verificar.', proximoPaso: 'Inventariar componentes y contrastar planos con infraestructura real.' },
  { codigo: 'AG-005', titulo: 'Permiso de vertimientos', antecedente: 'Radicado 967222026; requerimiento de 16/10/2026; primera prórroga de 30/10/2026; segunda solicitud por verificar. Fechas y plazos requieren validación contra originales y notificación.', proximoPaso: 'Verificar notificación y plazo efectivo; controlar cuatro exigencias documentales.' },
  { codigo: 'AG-006', titulo: 'Control financiero y cobros CVC', antecedente: 'Saldo a favor de $2.599.606 referido para cobro 89446243; aplicación pendiente de conciliación. No representa recaudo ni asiento contable.', proximoPaso: 'Verificar imputación y evitar duplicidad de pago o registro.' },
] as const;
const isoDate = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const contextoActual = () => {
  const { condominioId, usuarioId } = contexto.actual();
  if (!condominioId || !usuarioId) throw new Error('Falta el contexto de usuario o condominio.');
  return { condominioId, usuarioId };
};
const fechaDb = (s: string | null | undefined) => s ? new Date(`${s}T12:00:00.000Z`) : null;

@Injectable()
export class AmbientalService {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  private async asegurarProcesos(condominioId: string, usuarioId: string, tx: Prisma.TransactionClient) {
    const copropiedad = await tx.condominio.findFirst({ where: { id: condominioId }, select: { razonSocial: true } });
    // El tenant de prueba de REQ-007 se usa expresamente para validar el piloto con antecedentes demo.
    const nombreCopropiedad = copropiedad?.razonSocial.trim().toLocaleLowerCase('es-CO');
    if (!nombreCopropiedad || (!nombreCopropiedad.includes('majagua') && nombreCopropiedad !== 'copropiedad de prueba')) {
      throw new NotFoundException('Los expedientes REQ-007 de Majagua no están configurados para esta copropiedad.');
    }
    for (const p of BASE) {
      const proceso = await tx.procesoAmbiental.upsert({
        where: { condominioId_codigo: { condominioId, codigo: p.codigo } },
        create: { id: randomUUID(), condominioId, codigo: p.codigo, titulo: p.titulo, antecedente: p.antecedente, proximoPaso: p.proximoPaso, creadoPor: usuarioId },
        update: {},
      });
      if (await tx.actuacionAmbiental.count({ where: { condominioId, procesoId: proceso.id } }) === 0) {
        const antecedentes: Record<string, { asunto: string; tipo: string; descripcion: string; fecha?: string }[]> = {
          'AG-001': [{ asunto: 'Auto de desistimiento de renovación referido en el requerimiento', tipo: 'ACTUACION', descripcion: 'Referencia documental REQ-007: se informa auto fechado 06/08/2026. Acto íntegro, notificación y ejecutoria pendientes de verificación; no registrar como decisión firme hasta cotejo.', fecha: '2026-08-06' }],
          'AG-002': [{ asunto: 'Visita CVC programada', tipo: 'VISITA', descripcion: 'Visita referida para 15/10/2026. Acta y resultado oficial no acreditados.', fecha: '2026-10-15' }],
          'AG-003': [{ asunto: 'Diseños de captación y acueducto referidos', tipo: 'OTRO', descripcion: 'Se reportan diseños de captación, desarenador y acueducto disponibles. Adjuntos, ejecución, permisos y calidad del agua pendientes de inspección.' }],
          'AG-004': [{ asunto: 'Planos de PTAR referidos', tipo: 'OTRO', descripcion: 'Se informa recuperación de cuatro planos. Los archivos deben cargarse al expediente y contrastarse con la infraestructura; no acreditan aprobación ni ejecución.' }],
          'AG-005': [
            { asunto: 'Radicado de solicitud de permiso de vertimientos', tipo: 'RADICADO', descripcion: 'Radicado 967222026 referido en REQ-007; soporte original y estado actual pendientes de verificación.' },
            { asunto: 'Requerimiento CVC referido', tipo: 'REQUERIMIENTO', descripcion: 'Requerimiento fechado 16/10/2026. Confirmar contenido, notificación y término desde el acto original.', fecha: '2026-10-16' },
            { asunto: 'Primera solicitud de prórroga referida', tipo: 'PRORROGA', descripcion: 'Solicitud fechada 30/10/2026. No implica prórroga concedida ni altera un vencimiento hasta validar respuesta y notificación.', fecha: '2026-10-30' },
            { asunto: 'Segunda solicitud de prórroga referida', tipo: 'PRORROGA', descripcion: 'Se menciona una segunda solicitud en el REQ-007. Fecha, radicado, respuesta y notificación pendientes de verificación.' },
          ],
        };
        const rows = (antecedentes[p.codigo] ?? []).map((a) => ({ id: randomUUID(), condominioId, procesoId: proceso.id, asunto: a.asunto, tipo: a.tipo, entidad: 'CVC', descripcion: a.descripcion, fechaExpedicion: fechaDb(a.fecha), estado: 'PENDIENTE_VERIFICACION', creadoPor: usuarioId }));
        if (rows.length) await tx.actuacionAmbiental.createMany({ data: rows });
      }
      if (p.codigo === 'AG-005' && await tx.obligacionAmbiental.count({ where: { condominioId, procesoId: proceso.id } }) === 0) {
        const exigencias = [
          'Plano georreferenciado del sistema de vertimientos',
          'Modelación de vertimientos',
          'Plan de gestión del riesgo para el manejo de vertimientos',
          'Aclaración de matrículas inmobiliarias 373-120986 y 373-122611',
        ];
        await tx.obligacionAmbiental.createMany({ data: exigencias.map((titulo) => ({ id: randomUUID(), condominioId, procesoId: proceso.id, titulo, descripcion: 'Exigencia listada en el requerimiento REQ-007. Confirmar texto contra el requerimiento original y asociar plazo solo después de validar la notificación.', estado: 'PENDIENTE_VALIDAR', creadoPor: usuarioId, updatedAt: new Date() })) });
      }
      if (p.codigo === 'AG-006' && await tx.movimientoFinancieroAmbiental.count({ where: { condominioId, procesoId: proceso.id } }) === 0) {
        await tx.movimientoFinancieroAmbiental.create({ data: { id: randomUUID(), condominioId, procesoId: proceso.id, tipo: 'SALDO_A_FAVOR', concepto: 'Saldo a favor referido para cobro CVC 89446243', valor: new Prisma.Decimal('2599606'), referencia: '89446243', estado: 'PENDIENTE_CONCILIACION', nota: 'Dato preliminar del REQ-007. Crédito por conciliar; no constituye recaudo ni asiento contable.', creadoPor: usuarioId } });
      }
    }
  }

  async listar(buscar?: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.asegurarProcesos(condominioId, usuarioId, tx);
      const termino = buscar?.trim().slice(0, 120);
      const procesos = await tx.procesoAmbiental.findMany({
        where: { condominioId, ...(termino ? { OR: [
          { codigo: { contains: termino, mode: 'insensitive' } }, { titulo: { contains: termino, mode: 'insensitive' } },
          { radicado: { contains: termino, mode: 'insensitive' } }, { numeroExpediente: { contains: termino, mode: 'insensitive' } },
          { autoridad: { contains: termino, mode: 'insensitive' } }, { responsable: { contains: termino, mode: 'insensitive' } },
          { actuaciones: { some: { OR: [{ asunto: { contains: termino, mode: 'insensitive' } }, { radicado: { contains: termino, mode: 'insensitive' } }, { descripcion: { contains: termino, mode: 'insensitive' } }] } } },
          { obligaciones: { some: { OR: [{ titulo: { contains: termino, mode: 'insensitive' } }, { descripcion: { contains: termino, mode: 'insensitive' } }] } } },
          { documentos: { some: { OR: [{ nombre: { contains: termino, mode: 'insensitive' } }, { sha256: { contains: termino, mode: 'insensitive' } }] } } },
          { finanzas: { some: { OR: [{ concepto: { contains: termino, mode: 'insensitive' } }, { referencia: { contains: termino, mode: 'insensitive' } }] } } },
        ] } : {}) },
        include: { _count: { select: { actuaciones: true, obligaciones: true, documentos: true } }, obligaciones: { where: { estado: { in: ['ABIERTA','EN_CURSO','PENDIENTE_VALIDAR','VENCIDA'] } }, select: { estado: true, fechaVencimiento: true, vencimientoValidado: true } }, finanzas: { select: { tipo: true, valor: true, estado: true } } },
        orderBy: { codigo: 'asc' },
      });
      const permisos = await tx.permiso.findMany({ where: { membresiaId: { in: contexto.actual().membresiaIds ?? [] }, revocadoEn: null }, select: { area: true, accion: true, efecto: true, expedienteId: true } });
      const roles = contexto.actual().roles ?? [];
      const acciones = ['leer', 'crear', 'editar', 'aprobar', 'exportar'] as const;
      const visibles = procesos.flatMap((p) => {
        const accionesPermitidas = acciones.filter((accion) => evaluarPermiso({ roles, permisos, area: '06', accion, expedienteId: p.id }).permitido);
        return accionesPermitidas.includes('leer') ? [{ ...p, accionesPermitidas }] : [];
      });
      const hoyDate = new Date(`${hoy()}T00:00:00.000Z`);
      return visibles.map((p) => {
        const vencidoProceso = p.vencimientoVerificado && p.fechaVencimientoValidada && p.fechaVencimientoValidada < hoyDate ? 1 : 0;
        const proximoProceso = p.vencimientoVerificado && p.fechaVencimientoValidada && p.fechaVencimientoValidada >= hoyDate && p.fechaVencimientoValidada.getTime() - hoyDate.getTime() <= 30 * 86400000 ? 1 : 0;
        const vencidos = vencidoProceso + p.obligaciones.filter((o) => o.vencimientoValidado && o.fechaVencimiento && o.fechaVencimiento < hoyDate).length;
        const proximos = proximoProceso + p.obligaciones.filter((o) => o.vencimientoValidado && o.fechaVencimiento && o.fechaVencimiento >= hoyDate && o.fechaVencimiento.getTime() - hoyDate.getTime() <= 30 * 86400000).length;
        return { ...p, fechaExpedicion: isoDate(p.fechaExpedicion), fechaRecepcion: isoDate(p.fechaRecepcion), fechaNotificacion: isoDate(p.fechaNotificacion), fechaVencimientoValidada: isoDate(p.fechaVencimientoValidada), costoEstimado: p.costoEstimado?.toFixed(2) ?? null,
          alerta: vencidos ? { nivel: 'URGENTE', texto: `${vencidos} obligación(es) vencida(s) con plazo validado` } : proximos ? { nivel: 'RIESGO', texto: `${proximos} vencimiento(s) validado(s) en los próximos 30 días` } : { nivel: p.estadoJuridico === 'POR_VERIFICAR' ? 'POR_VERIFICAR' : 'NORMAL', texto: p.estadoJuridico === 'POR_VERIFICAR' ? 'Información pendiente de validación' : 'Sin vencimientos próximos verificados' },
          conteos: p._count, totalPendienteConciliar: p.finanzas.filter((f) => f.estado === 'PENDIENTE_CONCILIACION' && f.tipo === 'SALDO_A_FAVOR').reduce((a, f) => a + Number(f.valor), 0).toFixed(2),
        };
      });
    });
  }

  private async proceso(tx: Prisma.TransactionClient, condominioId: string, id: string) {
    const p = await tx.procesoAmbiental.findFirst({ where: { id, condominioId } });
    if (!p) throw new NotFoundException('Expediente ambiental no encontrado.');
    return p;
  }

  private async permisoSobreProceso(tx: Prisma.TransactionClient, expedienteId: string, accion: 'leer' | 'editar') {
    const c = contexto.actual();
    const permisos = await tx.permiso.findMany({ where: { membresiaId: { in: c.membresiaIds ?? [] }, revocadoEn: null }, select: { area: true, accion: true, efecto: true, expedienteId: true } });
    return evaluarPermiso({ roles: c.roles ?? [], permisos, area: '06', accion, expedienteId }).permitido;
  }

  async detalle(id: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const p = await this.proceso(tx, condominioId, id);
      const [actuaciones, obligaciones, documentos, finanzas, relacionesDesde, relacionesHacia, auditoria] = await Promise.all([
        tx.actuacionAmbiental.findMany({ where: { condominioId, procesoId: id }, orderBy: [{ fechaExpedicion: 'desc' }, { createdAt: 'desc' }] }),
        tx.obligacionAmbiental.findMany({ where: { condominioId, procesoId: id }, orderBy: [{ vencimientoValidado: 'desc' }, { fechaVencimiento: 'asc' }, { createdAt: 'desc' }] }),
        tx.documentoAmbiental.findMany({ where: { condominioId, OR: [{ procesoId: id }, { relacionesProcesos: { some: { procesoId: id } } }] }, include: { proceso: { select: { id: true, codigo: true, titulo: true } }, relacionesProcesos: { include: { proceso: { select: { id: true, codigo: true, titulo: true } } } } }, orderBy: { createdAt: 'desc' } }),
        tx.movimientoFinancieroAmbiental.findMany({ where: { condominioId, procesoId: id }, orderBy: { createdAt: 'desc' } }),
        tx.relacionProcesoAmbiental.findMany({ where: { condominioId, origenId: id }, include: { destino: { select: { id: true, codigo: true, titulo: true } } } }),
        tx.relacionProcesoAmbiental.findMany({ where: { condominioId, destinoId: id }, include: { origen: { select: { id: true, codigo: true, titulo: true } } } }),
        tx.auditoria.findMany({ where: { condominioId, objetoTipo: { in: ['proceso_ambiental','actuacion_ambiental','obligacion_ambiental','documento_ambiental','movimiento_financiero_ambiental','relacion_proceso_ambiental'] }, objetoId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, accion: true, actorId: true, antes: true, despues: true, createdAt: true } }),
      ]);
      return { proceso: { ...p, fechaExpedicion: isoDate(p.fechaExpedicion), fechaRecepcion: isoDate(p.fechaRecepcion), fechaNotificacion: isoDate(p.fechaNotificacion), fechaVencimientoValidada: isoDate(p.fechaVencimientoValidada), costoEstimado: p.costoEstimado?.toFixed(2) ?? null },
        actuaciones: actuaciones.map((a) => ({ ...a, fechaExpedicion: isoDate(a.fechaExpedicion), fechaRecepcion: isoDate(a.fechaRecepcion), fechaNotificacion: isoDate(a.fechaNotificacion) })),
        obligaciones: obligaciones.map((o) => ({ ...o, fechaNotificacion: isoDate(o.fechaNotificacion), fechaVencimiento: isoDate(o.fechaVencimiento) })),
        documentos: documentos.map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, mimeType: d.mimeType, tamano: d.tamano, sha256: d.sha256, verificacion: d.verificacion, createdAt: d.createdAt, procesoPrincipal: d.proceso, relaciones: d.relacionesProcesos.map((r) => r.proceso) })), finanzas: finanzas.map((f) => ({ ...f, valor: f.valor.toFixed(2), fecha: isoDate(f.fecha) })),
        relaciones: [...relacionesDesde.map((r) => ({ id: r.destino.id, codigo: r.destino.codigo, titulo: r.destino.titulo, motivo: r.motivo, direccion: 'SALIENTE' })), ...relacionesHacia.map((r) => ({ id: r.origen.id, codigo: r.origen.codigo, titulo: r.origen.titulo, motivo: r.motivo, direccion: 'ENTRANTE' }))], auditoria };
    });
  }

  async actualizar(id: string, dto: ActualizarProceso) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const antes = await this.proceso(tx, condominioId, id);
      if (dto.notificacionVerificada && !dto.fechaNotificacion) throw new ConflictException('Registre la fecha de notificación antes de marcarla como verificada.');
      if (dto.vencimientoVerificado && (!dto.fechaVencimientoValidada || !dto.notificacionVerificada || dto.plazoDias == null)) throw new ConflictException('Para verificar el vencimiento debe registrar fecha de vencimiento, notificación verificada y plazo.');
      const { fechaExpedicion, fechaRecepcion, fechaNotificacion, fechaVencimientoValidada, costoEstimado, ...campos } = dto;
      const data: Prisma.ProcesoAmbientalUpdateInput = { ...campos };
      if ('fechaExpedicion' in dto) data.fechaExpedicion = fechaDb(fechaExpedicion);
      if ('fechaRecepcion' in dto) data.fechaRecepcion = fechaDb(fechaRecepcion);
      if ('fechaNotificacion' in dto) data.fechaNotificacion = fechaDb(fechaNotificacion);
      if ('fechaVencimientoValidada' in dto) data.fechaVencimientoValidada = fechaDb(fechaVencimientoValidada);
      if ('costoEstimado' in dto) data.costoEstimado = costoEstimado === null ? null : costoEstimado === undefined ? undefined : new Prisma.Decimal(costoEstimado);
      const actualizado = await tx.procesoAmbiental.update({ where: { id }, data });
      await this.auditoria.registrar(tx, { accion: 'ambiental.proceso_actualizado', objetoTipo: 'proceso_ambiental', objetoId: id, condominioId, actorId: usuarioId, antes: antes as unknown as Prisma.InputJsonValue, despues: dto as unknown as Prisma.InputJsonValue });
      return actualizado;
    });
  }

  async cambiarEstado(id: string, dto: CambiarEstadoProceso) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const antes = await this.proceso(tx, condominioId, id);
      if (['APROBADO', 'PRORROGADO', 'CERRADO'].some((estado) => dto.estadoJuridico === estado || dto.estadoTecnico === estado)) {
        const evidencia = await tx.documentoAmbiental.findFirst({ where: { condominioId, verificacion: 'VALIDADO', OR: [{ procesoId: id }, { relacionesProcesos: { some: { procesoId: id } } }] }, select: { id: true } });
        if (!evidencia) throw new ConflictException('Cargue y valide el acto o soporte técnico antes de registrar aprobación, prórroga concedida o cierre.');
      }
      const actualizado = await tx.procesoAmbiental.update({ where: { id }, data: dto });
      await this.auditoria.registrar(tx, { accion: 'ambiental.estado_actualizado', objetoTipo: 'proceso_ambiental', objetoId: id, condominioId, actorId: usuarioId, antes: { estadoJuridico: antes.estadoJuridico, estadoTecnico: antes.estadoTecnico }, despues: dto });
      return actualizado;
    });
  }

  async crearActuacion(id: string, dto: CrearActuacion) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      const a = await tx.actuacionAmbiental.create({ data: { id: randomUUID(), condominioId, procesoId: id, asunto: dto.asunto, tipo: dto.tipo, entidad: dto.entidad, radicado: dto.radicado, descripcion: dto.descripcion, fechaExpedicion: fechaDb(dto.fechaExpedicion), fechaRecepcion: fechaDb(dto.fechaRecepcion), fechaNotificacion: fechaDb(dto.fechaNotificacion), estado: dto.estado ?? 'PENDIENTE_VERIFICACION', responsable: dto.responsable, creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.actuacion_registrada', objetoTipo: 'actuacion_ambiental', objetoId: a.id, condominioId, actorId: usuarioId, despues: { procesoId: id, asunto: a.asunto, tipo: a.tipo, radicado: a.radicado, estado: a.estado } });
      return a;
    });
  }

  async crearObligacion(id: string, dto: CrearObligacion) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      const o = await tx.obligacionAmbiental.create({ data: { id: randomUUID(), condominioId, procesoId: id, titulo: dto.titulo, descripcion: dto.descripcion, responsable: dto.responsable, fechaNotificacion: fechaDb(dto.fechaNotificacion), notificacionValidada: dto.notificacionValidada, plazoDias: dto.plazoDias, fechaVencimiento: fechaDb(dto.fechaVencimiento), vencimientoValidado: dto.vencimientoValidado, prioridad: dto.prioridad, estado: dto.vencimientoValidado ? 'ABIERTA' : 'PENDIENTE_VALIDAR', creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.obligacion_creada', objetoTipo: 'obligacion_ambiental', objetoId: o.id, condominioId, actorId: usuarioId, despues: { procesoId: id, titulo: o.titulo, fechaVencimiento: isoDate(o.fechaVencimiento), vencimientoValidado: o.vencimientoValidado } });
      return o;
    });
  }

  async actualizarObligacion(id: string, obligacionId: string, dto: ActualizarObligacion) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      const antes = await tx.obligacionAmbiental.findFirst({ where: { id: obligacionId, procesoId: id, condominioId } });
      if (!antes) throw new NotFoundException('Obligación no encontrada.');
      const notified = dto.notificacionValidada ?? antes.notificacionValidada;
      const notificationDate = 'fechaNotificacion' in dto ? dto.fechaNotificacion : isoDate(antes.fechaNotificacion);
      const deadline = 'fechaVencimiento' in dto ? dto.fechaVencimiento : isoDate(antes.fechaVencimiento);
      const days = dto.plazoDias === undefined ? antes.plazoDias : dto.plazoDias;
      if (dto.vencimientoValidado && (!notified || !notificationDate || !deadline)) throw new ConflictException('El vencimiento solo se valida con notificación y fecha límite verificadas.');
      if (dto.vencimientoValidado === true && days == null) throw new ConflictException('Registre el plazo antes de verificar el vencimiento.');
      if (dto.notificacionValidada && !notificationDate) throw new ConflictException('Registre la fecha de notificación antes de marcarla como validada.');
      if (dto.estado === 'CUMPLIDA' && !dto.evidenciaCierre && !antes.evidenciaCierre) throw new ConflictException('Adjunte o describa evidencia de cierre antes de marcar como cumplida.');
      if (!notified && antes.vencimientoValidado && dto.vencimientoValidado !== false) throw new ConflictException('Primero retire la validación del vencimiento y luego ajuste la notificación.');
      const data: Prisma.ObligacionAmbientalUpdateInput = { ...dto };
      if ('fechaNotificacion' in dto) data.fechaNotificacion = fechaDb(dto.fechaNotificacion);
      if ('fechaVencimiento' in dto) data.fechaVencimiento = fechaDb(dto.fechaVencimiento);
      const o = await tx.obligacionAmbiental.update({ where: { id: obligacionId }, data });
      await this.auditoria.registrar(tx, { accion: 'ambiental.obligacion_actualizada', objetoTipo: 'obligacion_ambiental', objetoId: obligacionId, condominioId, actorId: usuarioId, antes: antes as unknown as Prisma.InputJsonValue, despues: dto as unknown as Prisma.InputJsonValue });
      return o;
    });
  }

  async subirDocumento(id: string, archivo: Archivo, tipo: string, actuacionId?: string) {
    const { condominioId, usuarioId } = contextoActual();
    if (!archivo || !TIPOS_MIME.has(archivo.mimetype)) throw new ConflictException('Tipo de archivo no permitido. Use PDF, JPG, PNG, WEBP, DOCX o XLSX.');
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      if (actuacionId && !await tx.actuacionAmbiental.findFirst({ where: { id: actuacionId, procesoId: id, condominioId } })) throw new NotFoundException('Actuación no encontrada en este expediente.');
      const nombre = archivo.originalname.replace(/[\\/\p{Cc}]/gu, '_').slice(0, 180);
      const doc = await tx.documentoAmbiental.create({ data: { id: randomUUID(), condominioId, procesoId: id, actuacionId, nombre, tipo: tipo.slice(0, 80), mimeType: archivo.mimetype, tamano: archivo.size, sha256: createHash('sha256').update(archivo.buffer).digest('hex'), contenido: Uint8Array.from(archivo.buffer), creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.documento_cargado', objetoTipo: 'documento_ambiental', objetoId: doc.id, condominioId, actorId: usuarioId, despues: { procesoId: id, nombre: doc.nombre, sha256: doc.sha256, tamano: doc.tamano } });
      return { id: doc.id, nombre: doc.nombre, tipo: doc.tipo, mimeType: doc.mimeType, tamano: doc.tamano, sha256: doc.sha256, verificacion: doc.verificacion, createdAt: doc.createdAt };
    });
  }

  async obtenerDocumento(id: string, documentoId: string) {
    const { condominioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const d = await tx.documentoAmbiental.findFirst({ where: { id: documentoId, condominioId, OR: [{ procesoId: id }, { relacionesProcesos: { some: { procesoId: id } } }] } });
      if (!d) throw new NotFoundException('Documento no encontrado.');
      return { nombre: d.nombre, mimeType: d.mimeType, contenido: Buffer.from(d.contenido) };
    });
  }

  async verificarDocumento(id: string, documentoId: string, verificacion: 'VALIDADO' | 'OBSERVADO' | 'ARCHIVADO') {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      const antes = await tx.documentoAmbiental.findFirst({ where: { id: documentoId, condominioId, OR: [{ procesoId: id }, { relacionesProcesos: { some: { procesoId: id } } }] }, select: { id: true, verificacion: true, nombre: true } });
      if (!antes) throw new NotFoundException('Documento no encontrado.');
      const doc = await tx.documentoAmbiental.update({ where: { id: documentoId }, data: { verificacion }, select: { id: true, nombre: true, verificacion: true } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.documento_verificado', objetoTipo: 'documento_ambiental', objetoId: documentoId, condominioId, actorId: usuarioId, antes: { verificacion: antes.verificacion }, despues: { verificacion, nombre: antes.nombre } });
      return doc;
    });
  }

  async relacionarDocumento(id: string, documentoId: string, destinoId: string, motivo: string) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      const doc = await tx.documentoAmbiental.findFirst({ where: { id: documentoId, condominioId, OR: [{ procesoId: id }, { relacionesProcesos: { some: { procesoId: id } } }] }, select: { id: true, procesoId: true, nombre: true } });
      if (!doc) throw new NotFoundException('Documento no disponible en este expediente.');
      await this.proceso(tx, condominioId, destinoId);
      if (!await this.permisoSobreProceso(tx, destinoId, 'editar')) throw new NotFoundException('Expediente relacionado no disponible.');
      if (doc.procesoId === destinoId) throw new ConflictException('Ese expediente ya es el principal del documento.');
      const existente = await tx.relacionDocumentoAmbiental.findFirst({ where: { condominioId, documentoId, procesoId: destinoId } });
      if (existente) throw new ConflictException('El documento ya está relacionado con ese expediente.');
      const r = await tx.relacionDocumentoAmbiental.create({ data: { id: randomUUID(), condominioId, documentoId, procesoId: destinoId, motivo, creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.documento_relacionado', objetoTipo: 'documento_ambiental', objetoId: documentoId, condominioId, actorId: usuarioId, despues: { nombre: doc.nombre, procesoPrincipalId: doc.procesoId, procesoRelacionadoId: destinoId, motivo } });
      return r;
    });
  }

  async crearFinanza(id: string, dto: CrearFinanza) {
    const { condominioId, usuarioId } = contextoActual();
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id);
      const f = await tx.movimientoFinancieroAmbiental.create({ data: { id: randomUUID(), condominioId, procesoId: id, tipo: dto.tipo, concepto: dto.concepto, valor: new Prisma.Decimal(dto.valor), fecha: fechaDb(dto.fecha), referencia: dto.referencia, estado: dto.estado, nota: dto.nota, creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.finanza_registrada', objetoTipo: 'movimiento_financiero_ambiental', objetoId: f.id, condominioId, actorId: usuarioId, despues: { procesoId: id, tipo: f.tipo, concepto: f.concepto, valor: f.valor.toFixed(2), estado: f.estado } });
      return { ...f, valor: f.valor.toFixed(2), fecha: isoDate(f.fecha) };
    });
  }

  async relacionar(id: string, destinoId: string, motivo: string) {
    const { condominioId, usuarioId } = contextoActual();
    if (id === destinoId) throw new ConflictException('Un expediente no se puede relacionar consigo mismo.');
    return this.prisma.withTenant(condominioId, async (tx) => {
      await this.proceso(tx, condominioId, id); await this.proceso(tx, condominioId, destinoId);
      if (!await this.permisoSobreProceso(tx, destinoId, 'editar')) throw new NotFoundException('Expediente relacionado no disponible.');
      const r = await tx.relacionProcesoAmbiental.create({ data: { id: randomUUID(), condominioId, origenId: id, destinoId, motivo, creadoPor: usuarioId } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.procesos_relacionados', objetoTipo: 'relacion_proceso_ambiental', objetoId: r.id, condominioId, actorId: usuarioId, despues: { origenId: id, destinoId, motivo } });
      return r;
    });
  }

  async informe(id?: string) {
    const { condominioId, usuarioId } = contextoActual();
    const base = await this.prisma.withTenant(condominioId, async (tx) => {
      const where = { condominioId, ...(id ? { id } : {}) };
      if (id) await this.proceso(tx, condominioId, id);
      const procesos = await tx.procesoAmbiental.findMany({ where, orderBy: { codigo: 'asc' }, include: { obligaciones: true, actuaciones: true, documentos: { select: { id: true, nombre: true, tipo: true, verificacion: true } }, finanzas: true } });
      await this.auditoria.registrar(tx, { accion: 'ambiental.informe_exportado', objetoTipo: 'proceso_ambiental', objetoId: id, condominioId, actorId: usuarioId, despues: { alcance: id ? 'individual' : 'consolidado', procesos: procesos.length } });
      return procesos;
    });
    const pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => { pdf.on('data', (b: Buffer) => chunks.push(b)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
    pdf.fontSize(18).text(id ? 'Informe de expediente ambiental' : 'Resumen de expedientes ambientales', { align: 'left' });
    pdf.moveDown(0.3).fontSize(9).fillColor('#53635a').text(`Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · Las fechas límite solo se reportan como verificadas cuando existe validación humana.`);
    for (const p of base) {
      pdf.moveDown().fillColor('#14522f').fontSize(13).text(`${p.codigo} · ${p.titulo}`);
      pdf.fillColor('#142019').fontSize(9).text(`Estado jurídico: ${p.estadoJuridico} · Estado técnico: ${p.estadoTecnico} · Responsable: ${p.responsable ?? 'Sin asignar'}`);
      pdf.text(`Radicado: ${p.radicado ?? 'Sin registrar'} · Expediente: ${p.numeroExpediente ?? 'Sin registrar'} · Autoridad: ${p.autoridad ?? 'Sin registrar'}`);
      pdf.text(`Antecedente: ${p.antecedente ?? 'Sin antecedente registrado'}`);
      if (p.fechaVencimientoValidada && p.vencimientoVerificado) pdf.text(`Vencimiento verificado: ${isoDate(p.fechaVencimientoValidada)} · ${p.metodoComputo ?? ''}`);
      else pdf.text('Vencimiento legal: pendiente de verificación humana.');
      const ahora = new Date(`${hoy()}T00:00:00.000Z`);
      const vencidos = p.obligaciones.filter((o) => o.vencimientoValidado && o.fechaVencimiento && o.fechaVencimiento < ahora).length;
      const proximos = p.obligaciones.filter((o) => o.vencimientoValidado && o.fechaVencimiento && o.fechaVencimiento >= ahora && o.fechaVencimiento.getTime() - ahora.getTime() <= 30 * 86400000).length;
      pdf.text(`Riesgo por plazos verificados: ${vencidos ? `${vencidos} obligación(es) vencida(s)` : proximos ? `${proximos} vence(n) en 30 días` : 'sin vencimiento próximo verificado'}.`);
      pdf.text(`Obligaciones: ${p.obligaciones.length} · Actuaciones: ${p.actuaciones.length} · Documentos: ${p.documentos.length} · Registros financieros: ${p.finanzas.length}`);
      for (const a of p.actuaciones) pdf.text(`  • ${isoDate(a.fechaExpedicion)} · ${a.asunto} · ${a.radicado ?? 'sin radicado'} · ${a.estado}: ${a.descripcion}`);
      for (const d of p.documentos) pdf.text(`  • Documento: ${d.nombre} (${d.tipo}, ${d.verificacion})`);
      for (const o of p.obligaciones) pdf.text(`  • ${o.titulo} — ${o.estado}${o.vencimientoValidado ? ` — vence ${isoDate(o.fechaVencimiento)}` : ' — plazo por validar'}`);
      for (const f of p.finanzas) pdf.text(`  • ${f.tipo}: ${f.concepto} — $ ${f.valor.toFixed(2)} (${f.estado})`);
      if (p.proximoPaso) pdf.text(`Próximo paso: ${p.proximoPaso}`);
      pdf.moveDown(0.5).strokeColor('#dfe5e1').moveTo(48, pdf.y).lineTo(547, pdf.y).stroke();
    }
    pdf.end();
    return result;
  }
}
