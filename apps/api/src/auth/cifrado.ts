import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';

/** Cifra con AES-256-GCM. Formato: iv.tag.datos (base64). */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, clave, iv);
  const datos = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

export function descifrar(cifrado: string, clave: Buffer): string {
  const [iv, tag, datos] = cifrado.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !datos) throw new Error('Formato de cifrado inválido');
  const decipher = createDecipheriv(ALG, clave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(datos), decipher.final()]).toString('utf8');
}
