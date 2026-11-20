import { z } from 'zod';

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const fecha = z.iso.date().nullable().optional();

export const actualizarProceso = z.object({
  autoridad: texto(160), numeroExpediente: texto(120), radicado: texto(120), objeto: texto(2000),
  proximoPaso: texto(1000),
  prioridad: z.enum(['BAJA','MEDIA','ALTA','URGENTE']).optional(), responsable: texto(180),
  fechaExpedicion: fecha, fechaRecepcion: fecha, fechaNotificacion: fecha,
  notificacionVerificada: z.boolean().optional(), plazoDias: z.number().int().min(0).max(3650).nullable().optional(),
  metodoComputo: texto(300), fechaVencimientoValidada: fecha, vencimientoVerificado: z.boolean().optional(),
  costoEstimado: z.number().nonnegative().max(100_000_000_000).nullable().optional(),
}).strict().refine((x) => Object.keys(x).length > 0, 'Indique los cambios.');

export const cambiarEstadoProceso = z.object({
  estadoJuridico: z.enum(['POR_VERIFICAR','SOLICITADO','RADICADO','REQUERIDO','PRORROGADO','EN_TRAMITE','APROBADO','NEGADO','DESISTIDO','CERRADO']).optional(),
  estadoTecnico: z.enum(['POR_VERIFICAR','SOLICITADO','RADICADO','REQUERIDO','PRORROGADO','EN_TRAMITE','APROBADO','NEGADO','DESISTIDO','CERRADO']).optional(),
}).strict().refine((x) => Object.keys(x).length > 0, 'Indique el estado jurídico o técnico.');

export const crearActuacion = z.object({
  asunto: z.string().trim().min(2).max(240), tipo: z.enum(['ACTUACION','RADICADO','NOTIFICACION','REQUERIMIENTO','PRORROGA','VISITA','PERMISO','RECURSO','OTRO']),
  entidad: texto(160), radicado: texto(120), descripcion: z.string().trim().min(2).max(4000),
  fechaExpedicion: fecha, fechaRecepcion: fecha, fechaNotificacion: fecha,
  estado: z.enum(['PENDIENTE_VERIFICACION','RECIBIDO','RADICADO','REQUERIDO','EN_TRAMITE','APROBADO','NEGADO','DESISTIDO']), responsable: texto(180),
}).strict();

export const crearObligacion = z.object({
  titulo: z.string().trim().min(2).max(240), descripcion: texto(2000), responsable: texto(180),
  fechaNotificacion: fecha, notificacionValidada: z.boolean().default(false), plazoDias: z.number().int().min(0).max(3650).nullable().optional(),
  fechaVencimiento: fecha, vencimientoValidado: z.boolean().default(false), prioridad: z.enum(['BAJA','MEDIA','ALTA','URGENTE']).default('MEDIA'),
}).strict().superRefine((x, ctx) => {
  if (x.notificacionValidada && !x.fechaNotificacion) {
    ctx.addIssue({ code: 'custom', message: 'Registre la fecha de notificación antes de marcarla como validada.', path: ['notificacionValidada'] });
  }
  if (x.vencimientoValidado && (!x.fechaVencimiento || !x.notificacionValidada || !x.fechaNotificacion || x.plazoDias == null)) {
    ctx.addIssue({ code: 'custom', message: 'Para validar el vencimiento registre y valide la fecha de notificación y el vencimiento.', path: ['vencimientoValidado'] });
  }
});

export const actualizarObligacion = z.object({
  responsable: texto(180), estado: z.enum(['PENDIENTE_VALIDAR','ABIERTA','EN_CURSO','CUMPLIDA','VENCIDA','CANCELADA']).optional(),
  fechaNotificacion: fecha, notificacionValidada: z.boolean().optional(), plazoDias: z.number().int().min(0).max(3650).nullable().optional(),
  fechaVencimiento: fecha, vencimientoValidado: z.boolean().optional(), prioridad: z.enum(['BAJA','MEDIA','ALTA','URGENTE']).optional(), evidenciaCierre: texto(1000),
}).strict().refine((x) => Object.keys(x).length > 0, 'Indique los cambios.');

export const crearFinanza = z.object({
  tipo: z.enum(['COBRO','PAGO','SALDO_A_FAVOR','AJUSTE']), concepto: z.string().trim().min(2).max(240),
  valor: z.number().positive().max(100_000_000_000), fecha: fecha, referencia: texto(120),
  estado: z.enum(['PENDIENTE_CONCILIACION','CONCILIADO','PAGADO','APLICADO']).default('PENDIENTE_CONCILIACION'), nota: texto(1000),
}).strict();

export const relacionarProceso = z.object({ destinoId: z.uuid(), motivo: z.string().trim().min(2).max(500) }).strict();

export type ActualizarProceso = z.infer<typeof actualizarProceso>;
export type CambiarEstadoProceso = z.infer<typeof cambiarEstadoProceso>;
export type CrearActuacion = z.infer<typeof crearActuacion>;
export type CrearObligacion = z.infer<typeof crearObligacion>;
export type ActualizarObligacion = z.infer<typeof actualizarObligacion>;
export type CrearFinanza = z.infer<typeof crearFinanza>;
