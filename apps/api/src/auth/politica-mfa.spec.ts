import { describe, expect, it } from 'vitest';
import { decidirMfa } from './politica-mfa';

const base = {
  global: true,
  politica: 'HEREDAR' as const,
  esSuperadmin: false,
  roles: [] as never[],
};

describe('decidirMfa: la regla global prima sobre la individual', () => {
  it('global apagado: nadie lo necesita, aunque el usuario lo tenga obligatorio', () => {
    for (const politica of ['HEREDAR', 'OBLIGATORIO', 'NO_REQUERIDO'] as const) {
      expect(decidirMfa({ ...base, global: false, politica })).toEqual({
        requerido: false,
        motivo: 'GLOBAL_APAGADO',
      });
    }
    expect(
      decidirMfa({ ...base, global: false, esSuperadmin: true, politica: 'OBLIGATORIO' }).requerido,
    ).toBe(false);
    expect(decidirMfa({ ...base, global: false, roles: ['ADMINISTRADORA'] }).requerido).toBe(false);
  });

  it('global encendido: lo individual decide', () => {
    expect(decidirMfa({ ...base, politica: 'OBLIGATORIO' })).toEqual({
      requerido: true,
      motivo: 'USUARIO_OBLIGATORIO',
    });
    expect(decidirMfa({ ...base, politica: 'NO_REQUERIDO', roles: ['ADMINISTRADORA'] })).toEqual({
      requerido: false,
      motivo: 'USUARIO_EXENTO',
    });
    expect(decidirMfa({ ...base, politica: 'NO_REQUERIDO', esSuperadmin: true }).requerido).toBe(
      false,
    );
  });

  it('global encendido sin ajuste individual: se conserva la regla por rol de siempre', () => {
    expect(decidirMfa({ ...base, esSuperadmin: true })).toEqual({ requerido: true, motivo: 'ROL' });
    for (const rol of ['ADMINISTRADORA', 'CONTADORA', 'ASESOR_JURIDICO'] as const) {
      expect(decidirMfa({ ...base, roles: [rol] })).toEqual({ requerido: true, motivo: 'ROL' });
    }
    for (const rol of ['ASISTENTE', 'OPERACIONES', 'CONSEJO'] as const) {
      expect(decidirMfa({ ...base, roles: [rol] })).toEqual({
        requerido: false,
        motivo: 'NINGUNO',
      });
    }
    expect(decidirMfa({ ...base, roles: ['ASISTENTE', 'CONTADORA'] }).requerido).toBe(true);
  });
});
