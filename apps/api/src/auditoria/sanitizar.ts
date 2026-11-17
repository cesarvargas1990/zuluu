import { Prisma } from '@prisma/client';

const PATRON_SENSIBLE = /(password|secret|secreto|token)/i;
const CLAVES_SENSIBLES = new Set(['hash', 'refreshhash', 'codigo', 'codigosrespaldo']);

const esSensible = (clave: string) =>
  PATRON_SENSIBLE.test(clave) || CLAVES_SENSIBLES.has(clave.toLowerCase());

/** Copia profunda sin contraseñas, secretos, tokens ni códigos MFA. Nunca auditar esos datos. */
export function sanitizar<T>(valor: T): T {
  if (valor === undefined || valor === null) return valor;
  if (valor instanceof Prisma.Decimal) return valor.toString() as T;
  if (Array.isArray(valor)) return valor.map((v) => sanitizar(v)) as T;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([k]) => !esSensible(k))
        .map(([k, v]) => [k, sanitizar(v)]),
    ) as T;
  }
  return valor;
}
