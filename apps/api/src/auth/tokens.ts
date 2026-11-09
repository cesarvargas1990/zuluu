import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de 256 bits en base64url (refresh, recuperación). */
export const generarTokenOpaco = () => randomBytes(32).toString('base64url');

export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');
