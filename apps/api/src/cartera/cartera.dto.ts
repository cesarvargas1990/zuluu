import { z } from 'zod';

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const monto = z
  .union([z.string(), z.number()])
  .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0);
export const filtrosCartera = z
  .object({
    buscar: z.string().trim().max(120).optional(),
    unidadId: z.uuid().optional(),
    propietarioId: z.uuid().optional(),
    periodoDesde: periodo.optional(),
    periodoHasta: periodo.optional(),
    estado: z.enum(['PENDIENTE', 'PAGADA', 'PARCIAL', 'VENCIDA']).optional(),
    minimo: z.coerce.number().nonnegative().optional(),
    maximo: z.coerce.number().nonnegative().optional(),
  })
  .strict();
export type FiltrosCartera = z.infer<typeof filtrosCartera>;
export const crearObligacion = z
  .object({
    unidadId: z.uuid(),
    concepto: z.enum([
      'CUOTA_ADMINISTRACION',
      'CUOTA_VENCIDA',
      'INTERESES',
      'CUOTA_EXTRAORDINARIA',
      'OTRO',
    ]),
    periodo,
    descripcion: z.string().trim().max(300).optional(),
    fechaEmision: z.iso.date(),
    fechaVencimiento: z.iso.date(),
    valor: monto,
  })
  .strict();
export const crearGestion = z
  .object({
    unidadId: z.uuid(),
    fecha: z.iso.date(),
    canal: z.enum(['TELEFONO', 'CORREO', 'WHATSAPP', 'PRESENCIAL', 'CARTA', 'OTRO']),
    contacto: z.string().trim().max(180).optional(),
    resultado: z.string().trim().min(3).max(1000),
    proximaFecha: z.iso.date().optional(),
  })
  .strict();
export const crearCompromiso = z
  .object({
    unidadId: z.uuid(),
    gestionId: z.uuid().optional(),
    fechaPactada: z.iso.date(),
    valor: monto,
    observaciones: z.string().trim().max(1000).optional(),
  })
  .strict();
export const crearAjuste = z
  .object({
    obligacionId: z.uuid(),
    tipo: z.enum(['DEBITO', 'CREDITO']),
    valor: monto,
    motivo: z.string().trim().min(10).max(1000),
    soporte: z.string().trim().max(500).optional(),
  })
  .strict();
export const resolverAjuste = z
  .object({ aprobar: z.boolean(), nota: z.string().trim().min(5).max(1000) })
  .strict();
export const previsualizarSaldos = z
  .object({
    archivo: z.string().trim().min(1).max(180),
    fechaCorte: z.iso.date(),
    filas: z
      .array(
        z
          .object({
            unidad: z.string().trim().min(1).max(60),
            periodo,
            fechaVencimiento: z.iso.date(),
            valor: monto,
            descripcion: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();
export type CrearObligacion = z.infer<typeof crearObligacion>;
export type CrearGestion = z.infer<typeof crearGestion>;
export type CrearCompromiso = z.infer<typeof crearCompromiso>;
export type CrearAjuste = z.infer<typeof crearAjuste>;
export type ResolverAjuste = z.infer<typeof resolverAjuste>;
export type PrevisualizarSaldos = z.infer<typeof previsualizarSaldos>;
