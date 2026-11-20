import { z } from 'zod';

export const crearPeriodoCobro = z
  .object({
    periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo no válido (AAAA-MM)'),
    fechaCorte: z.iso.date(),
    fechaVencimiento: z.iso.date(),
    conceptos: z
      .array(
        z
          .object({
            nombre: z.string().trim().min(2).max(120),
            descripcion: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine((v) => v.fechaVencimiento >= v.fechaCorte, {
    path: ['fechaVencimiento'],
    message: 'El vencimiento no puede ser anterior al corte',
  });

export const anularCuentaCobro = z
  .object({
    motivo: z
      .string()
      .trim()
      .min(10, 'La anulación requiere una justificación de al menos 10 caracteres.')
      .max(1000),
  })
  .strict();

export const crearEnvioCuentaCobro = z
  .object({
    canal: z.enum(['CORREO', 'PRESENCIAL', 'OTRO']),
    destinatario: z.string().trim().min(1).max(254),
  })
  .strict();
