import { z } from 'zod';
import { hoyEnBogota, parsearValor } from '../recaudos/recaudos.reglas';

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo no válido (AAAA-MM)');
const valor = z
  .union([z.number(), z.string()])
  .refine(
    (v) => parsearValor(v) !== null,
    'Ingrese un valor mayor que cero, con máximo dos decimales',
  );
const texto = (max: number) => z.string().trim().max(max).optional().nullable();
const corte = z.iso
  .date('Fecha de corte no válida')
  .refine((f) => f <= hoyEnBogota(), 'La fecha de corte no puede ser futura')
  .optional();
const concepto = z.enum([
  'CUOTA_ADMINISTRACION',
  'CUOTA_VENCIDA',
  'INTERESES',
  'CUOTA_EXTRAORDINARIA',
  'OTRO',
  'SALDO_INICIAL',
]);
const montoConsulta = z.coerce.number('Valor no válido').nonnegative().optional();

const filtrosBase = {
  corte,
  buscar: z.string().trim().max(120).optional(),
  unidadId: z.uuid().optional(),
  propietarioId: z.uuid().optional(),
  periodoDesde: periodo.optional(),
  periodoHasta: periodo.optional(),
  minimo: montoConsulta,
  maximo: montoConsulta,
};

/** Cartera por unidad. */
export const filtrosCartera = z
  .object({
    ...filtrosBase,
    estado: z.enum(['CON_SALDO', 'VENCIDA', 'CORRIENTE', 'AL_DIA']).optional(),
  })
  .strict();
export type FiltrosCartera = z.infer<typeof filtrosCartera>;

/** Obligaciones una a una. */
export const filtrosObligaciones = z
  .object({
    ...filtrosBase,
    estado: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA']).optional(),
    concepto: concepto.optional(),
  })
  .strict();
export type FiltrosObligaciones = z.infer<typeof filtrosObligaciones>;

export const consultaCorte = z.object({ corte }).strict();

export const crearObligacion = z
  .object({
    unidadId: z.uuid(),
    concepto,
    periodo,
    descripcion: texto(300),
    fechaEmision: z.iso.date('Fecha de emisión no válida'),
    fechaVencimiento: z.iso.date('Fecha de vencimiento no válida'),
    valor,
  })
  .strict()
  .refine((d) => d.fechaVencimiento >= d.fechaEmision, {
    path: ['fechaVencimiento'],
    message: 'El vencimiento no puede ser anterior a la emisión',
  });
export type CrearObligacion = z.infer<typeof crearObligacion>;

export const generarObligaciones = z
  .object({
    periodo,
    fechaEmision: z.iso.date('Fecha de emisión no válida'),
    fechaVencimiento: z.iso.date('Fecha de vencimiento no válida'),
  })
  .strict()
  .refine((d) => d.fechaVencimiento >= d.fechaEmision, {
    path: ['fechaVencimiento'],
    message: 'El vencimiento no puede ser anterior a la emisión',
  });
export type GenerarObligaciones = z.infer<typeof generarObligaciones>;

const datosCompromiso = {
  fechaPactada: z.iso.date('Fecha pactada no válida'),
  valor,
  observaciones: texto(1000),
};

export const crearGestion = z
  .object({
    unidadId: z.uuid(),
    fecha: z.iso
      .date('Fecha no válida')
      .refine((f) => f <= hoyEnBogota(), 'La fecha de la gestión no puede ser futura'),
    canal: z.enum(
      ['TELEFONO', 'CORREO', 'WHATSAPP', 'PRESENCIAL', 'CARTA', 'OTRO'],
      'Canal no válido',
    ),
    contacto: texto(180),
    resultado: z.string().trim().min(3, 'Describa el resultado de la gestión').max(1000),
    proximaFecha: z.iso.date('Fecha de seguimiento no válida').optional().nullable(),
    /** Compromiso de pago acordado en esta gestión (opcional). */
    compromiso: z.object(datosCompromiso).strict().optional().nullable(),
  })
  .strict();
export type CrearGestion = z.infer<typeof crearGestion>;

export const filtrosGestiones = z
  .object({
    unidadId: z.uuid().optional(),
    desde: z.iso.date().optional(),
    hasta: z.iso.date().optional(),
  })
  .strict();
export type FiltrosGestiones = z.infer<typeof filtrosGestiones>;

export const crearCompromiso = z.object({ unidadId: z.uuid(), ...datosCompromiso }).strict();
export type CrearCompromiso = z.infer<typeof crearCompromiso>;

const estadoCompromiso = z.enum(['ABIERTO', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO']);
export const filtrosCompromisos = z
  .object({ unidadId: z.uuid().optional(), estado: estadoCompromiso.optional() })
  .strict();
export type FiltrosCompromisos = z.infer<typeof filtrosCompromisos>;
export const cambiarCompromiso = z
  .object({ estado: z.enum(['CUMPLIDO', 'INCUMPLIDO', 'CANCELADO']), observaciones: texto(1000) })
  .strict();
export type CambiarCompromiso = z.infer<typeof cambiarCompromiso>;

export const crearAjuste = z
  .object({
    obligacionId: z.uuid(),
    tipo: z.enum(['DEBITO', 'CREDITO']),
    valor,
    motivo: z.string().trim().min(10, 'El ajuste requiere motivo y autorización.').max(1000),
    soporte: texto(500),
  })
  .strict();
export type CrearAjuste = z.infer<typeof crearAjuste>;
export const filtrosAjustes = z
  .object({ estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']).optional() })
  .strict();
export const resolverAjuste = z
  .object({
    aprobar: z.boolean(),
    nota: z.string().trim().min(5, 'Escriba la nota de resolución').max(1000),
  })
  .strict();
export type ResolverAjuste = z.infer<typeof resolverAjuste>;

export const tipoReporte = z.enum(['general', 'vencida', 'estado-cuenta', 'gestiones']);
export type TipoReporte = z.infer<typeof tipoReporte>;
export const consultaReporte = z
  .object({
    ...filtrosBase,
    formato: z.enum(['xlsx', 'pdf']),
    estado: z.enum(['CON_SALDO', 'VENCIDA', 'CORRIENTE', 'AL_DIA']).optional(),
  })
  .strict();
export type ConsultaReporte = z.infer<typeof consultaReporte>;
