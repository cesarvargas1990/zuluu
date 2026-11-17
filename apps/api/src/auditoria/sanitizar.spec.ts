import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { sanitizar } from './sanitizar';

describe('sanitizar', () => {
  it('elimina contraseñas, secretos, tokens y códigos en cualquier nivel', () => {
    const r = sanitizar({
      email: 'a@b.test',
      password: 'x',
      passwordHash: 'h',
      mfa: { secreto: 's', mfaSecretoCifrado: 'c', codigosRespaldo: ['1'] },
      refreshToken: 't',
      lista: [{ token: 't', nombre: 'n' }],
    });
    expect(r).toEqual({ email: 'a@b.test', mfa: {}, lista: [{ nombre: 'n' }] });
  });

  it('conserva valores no sensibles y nulos', () => {
    expect(sanitizar({ rol: 'ASISTENTE', activo: false, venceEn: null })).toEqual({
      rol: 'ASISTENTE',
      activo: false,
      venceEn: null,
    });
  });

  it('serializa decimales de Prisma como texto compatible con JSON', () => {
    expect(sanitizar({ areaM2: new Prisma.Decimal('12.50'), cuota: new Prisma.Decimal('12000') })).toEqual({
      areaM2: '12.5',
      cuota: '12000',
    });
  });

  it('devuelve undefined para entradas vacías', () => {
    expect(sanitizar(undefined)).toBeUndefined();
  });
});
