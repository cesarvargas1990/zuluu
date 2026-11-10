import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  APP_DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SEG: z.coerce.number().int().positive().max(900).default(900),
  REFRESH_INACTIVIDAD_HORAS: z.coerce.number().positive().default(12),
  REFRESH_MAX_DIAS: z.coerce.number().positive().default(7),
  MFA_ENC_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'MFA_ENC_KEY debe ser 32 bytes en base64',
    ),
  WEB_ORIGIN: z.string().url(),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  /** Usuario y clave SMTP (p. ej. Gmail con clave de aplicación). Vacíos = sin autenticación (Mailpit). */
  SMTP_USER: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  /** TLS directo (puerto 465). Si no se indica, se deduce del puerto. */
  SMTP_SECURE: z
    .enum(['true', 'false', ''])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  MAIL_FROM: z.string().default('ZULU ADMIN <no-responder@zulu.test>'),
  /** Prefijo público de la web (p. ej. /zulu en producción). */
  WEB_BASE_PATH: z
    .string()
    .default('')
    .transform((v) => v.replace(/\/+$/, '')),
});

export type Env = z.infer<typeof esquema> & { mfaClave: Buffer };

export const ENV = Symbol('ENV');

/** Falla al arrancar si falta o es inválida alguna variable (secretos fuera del código). */
export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  const r = esquema.safeParse(fuente);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return { ...r.data, mfaClave: Buffer.from(r.data.MFA_ENC_KEY, 'base64') };
}
