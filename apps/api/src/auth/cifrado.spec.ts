import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, descifrar } from './cifrado';
import { generarTokenOpaco, sha256 } from './tokens';

const clave = randomBytes(32);

describe('cifrado AES-256-GCM', () => {
  it('cifra y descifra sin dejar el texto en claro', () => {
    const c = cifrar('JBSWY3DPEHPK3PXP', clave);
    expect(c).not.toContain('JBSWY3DPEHPK3PXP');
    expect(descifrar(c, clave)).toBe('JBSWY3DPEHPK3PXP');
  });
  it('dos cifrados del mismo texto son distintos (IV aleatorio)', () => {
    expect(cifrar('x', clave)).not.toBe(cifrar('x', clave));
  });
  it('falla si el texto cifrado fue alterado', () => {
    const [iv, tag, datos] = cifrar('secreto', clave).split('.');
    const alterado = [iv, tag, Buffer.from('zzzz').toString('base64')].join('.');
    expect(() => descifrar(alterado, clave)).toThrow();
    expect(datos).toBeDefined();
  });
  it('falla con otra clave', () => {
    expect(() => descifrar(cifrar('x', clave), randomBytes(32))).toThrow();
  });
});

describe('tokens opacos', () => {
  it('genera tokens únicos de 43 caracteres base64url', () => {
    const a = generarTokenOpaco();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(generarTokenOpaco());
  });
  it('sha256 es determinista y no revela el token', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).toHaveLength(64);
  });
});
