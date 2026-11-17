import { z } from 'zod';
import { hoyEnBogota, parsearValor } from './recaudos.reglas';

const medio = z.enum(
  ['TRANSFERENCIA', 'CONSIGNACION', 'EFECTIVO', 'OTRO'],
  'Medio de pago no válido',
);
const estado = z.enum(['PENDIENTE', 'VERIFICADO', 'OBSERVADO', 'ANULADO']);
const concepto = z.enum([
  'CUOTA_ADMINISTRACION',
  'CUOTA_VENCIDA',
  'INTERESES',
  'CUOTA_EXTRAORDINARIA',
  'OTRO',
  'SALDO_INICIAL',
]);
const texto = (max: number) => z.string().trim().max(max).optional().nullable();
const valor = z
  .union([z.number(), z.string()])
  .refine(
    (v) => parsearValor(v) !== null,
    'Ingrese un valor mayor que cero, con máximo dos decimales',
  );
const fechaPago = z.iso
  .date('Fecha no válida')
  .refine((f) => f <= hoyEnBogota(), 'La fecha del pago no puede ser futura');

const datosPago = {
  fechaPago,
  valor,
  medio,
  referencia: texto(80),
  banco: texto(120),
  pagador: texto(180),
  observacion: texto(1000),
  unidadId: z.uuid().optional().nullable(),
  propietarioId: z.uuid().optional().nullable(),
};

export const registrarRecaudo = z
  .object({ ...datosPago, confirmarDuplicado: z.boolean().optional() })
  .strict();
export type RegistrarRecaudo = z.infer<typeof registrarRecaudo>;

export const modificarRecaudo = z
  .object(datosPago)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indique los cambios');
export type ModificarRecaudo = z.infer<typeof modificarRecaudo>;

export const verificarRecaudo = z
  .object({
    imputaciones: z
      .array(
        z
          .object({
            concepto,
            periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo no válido (AAAA-MM)'),
            valorObligacion: valor.optional().nullable(),
            valorAplicado: valor,
          })
          .strict(),
      )
      .max(60),
    observacion: texto(1000),
  })
  .strict();
export type VerificarRecaudo = z.infer<typeof verificarRecaudo>;

export const observarRecaudo = z
  .object({ observacion: z.string().trim().min(5, 'Describa la observación').max(1000) })
  .strict();

export const anularRecaudo = z
  .object({ motivo: z.string().trim().min(10, 'Indique el motivo de la anulación').max(1000) })
  .strict();

export const filtrosRecaudos = z
  .object({
    buscar: z.string().trim().max(100).optional(),
    estado: estado.optional(),
    medio: medio.optional(),
    unidadId: z.uuid().optional(),
    propietarioId: z.uuid().optional(),
    desde: z.iso.date().optional(),
    hasta: z.iso.date().optional(),
    bandeja: z.enum(['identificar', 'revision']).optional(),
  })
  .strict();
export type FiltrosRecaudos = z.infer<typeof filtrosRecaudos>;

export const CAMPOS_IMPORTACION = [
  'fechaPago',
  'valor',
  'medio',
  'unidad',
  'referencia',
  'pagador',
  'banco',
  'observacion',
] as const;

export const previsualizarImportacion = z
  .object({
    archivo: z.string().trim().max(180).optional(),
    filas: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
      .min(1, 'El archivo no tiene filas')
      .max(2000, 'Máximo 2.000 filas por archivo'),
    columnas: z.partialRecord(z.enum(CAMPOS_IMPORTACION), z.string().max(200)),
  })
  .strict();
export type PrevisualizarImportacion = z.infer<typeof previsualizarImportacion>;

export const confirmarImportacion = z
  .object({ incluirDuplicados: z.boolean().optional() })
  .strict();
