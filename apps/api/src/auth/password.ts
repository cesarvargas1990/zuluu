import { hash, verify } from '@node-rs/argon2';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Parámetros argon2id recomendados por OWASP (m=19 MiB, t=2, p=1).
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Devuelve el mensaje de error en español o null si la contraseña cumple la política. */
export function validarPolitica(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `La contraseña no puede superar ${PASSWORD_MAX} caracteres.`;
  }
  return null;
}

export const hashPassword = (password: string) => hash(password, OPCIONES);

export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password);
  } catch {
    return false;
  }
}

/** Hash fijo para igualar tiempos cuando el usuario no existe (no revelar si el email existe). */
let hashSenuelo: Promise<string> | undefined;
export const obtenerHashSenuelo = () => (hashSenuelo ??= hashPassword('señuelo-no-es-una-cuenta'));
