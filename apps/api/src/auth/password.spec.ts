import { describe, expect, it } from 'vitest';
import { hashPassword, validarPolitica, verificarPassword } from './password';

describe('política de contraseñas', () => {
  it('rechaza menos de 12 caracteres con mensaje en español', () => {
    expect(validarPolitica('corta123')).toMatch(/12 caracteres/);
  });
  it('rechaza más de 128 caracteres', () => {
    expect(validarPolitica('a'.repeat(129))).toMatch(/128/);
  });
  it('acepta 12 o más caracteres', () => {
    expect(validarPolitica('una-frase-larga')).toBeNull();
  });
});

describe('hash argon2id', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const hash = await hashPassword('una-frase-larga');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('una-frase-larga');
    await expect(verificarPassword(hash, 'una-frase-larga')).resolves.toBe(true);
    await expect(verificarPassword(hash, 'otra-frase-larga')).resolves.toBe(false);
  });
  it('un hash inválido no lanza, devuelve false', async () => {
    await expect(verificarPassword('no-es-hash', 'x')).resolves.toBe(false);
  });
});
