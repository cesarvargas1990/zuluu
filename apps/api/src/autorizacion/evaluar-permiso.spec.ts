import { describe, expect, it } from 'vitest';
import { evaluarPermiso, type PermisoExplicito } from './evaluar-permiso';

const concesion = (p: Partial<PermisoExplicito>): PermisoExplicito => ({
  area: '03',
  accion: 'leer',
  efecto: 'CONCEDER',
  expedienteId: null,
  ...p,
});

describe('evaluarPermiso', () => {
  it('permite lo que da la matriz del rol', () => {
    expect(
      evaluarPermiso({ roles: ['CONTADORA'], permisos: [], area: '02', accion: 'aprobar' }),
    ).toEqual({ permitido: true, motivo: 'rol' });
  });

  it('ASISTENTE no puede aprobar en Finanzas (§13.1)', () => {
    expect(
      evaluarPermiso({ roles: ['ASISTENTE'], permisos: [], area: '02', accion: 'aprobar' }),
    ).toEqual({ permitido: false, motivo: 'sin_permiso' });
  });

  it('ASISTENTE no lee Jurídica sin concesión (§13.1)', () => {
    expect(
      evaluarPermiso({ roles: ['ASISTENTE'], permisos: [], area: '04', accion: 'leer' }).permitido,
    ).toBe(false);
  });

  it('CONSEJO sin concesiones no accede', () => {
    expect(
      evaluarPermiso({ roles: ['CONSEJO'], permisos: [], area: '09', accion: 'leer' }).permitido,
    ).toBe(false);
  });

  it('una concesión explícita amplía la matriz', () => {
    const r = evaluarPermiso({
      roles: ['OPERACIONES'],
      permisos: [concesion({ area: '03', accion: 'leer' })],
      area: '03',
      accion: 'leer',
    });
    expect(r).toEqual({ permitido: true, motivo: 'concesion' });
  });

  it('una restricción de área prevalece sobre el rol y las concesiones', () => {
    const r = evaluarPermiso({
      roles: ['ADMINISTRADORA'],
      permisos: [
        concesion({ area: '02', accion: 'exportar' }),
        concesion({ area: '02', accion: 'exportar', efecto: 'RESTRINGIR' }),
      ],
      area: '02',
      accion: 'exportar',
    });
    expect(r).toEqual({ permitido: false, motivo: 'restriccion' });
  });

  it('una restricción por expediente solo aplica a ese expediente', () => {
    const permisos = [
      concesion({ area: '04', accion: 'leer', efecto: 'RESTRINGIR', expedienteId: 'exp-x' }),
    ];
    const base = {
      roles: ['ASESOR_JURIDICO' as const],
      permisos,
      area: '04' as const,
      accion: 'leer' as const,
    };
    expect(evaluarPermiso({ ...base, expedienteId: 'exp-x' }).permitido).toBe(false);
    expect(evaluarPermiso({ ...base, expedienteId: 'exp-y' }).permitido).toBe(true);
    expect(evaluarPermiso(base).permitido).toBe(true);
  });

  it('una concesión de expediente no abre toda el área', () => {
    const permisos = [concesion({ area: '04', accion: 'leer', expedienteId: 'exp-x' })];
    const base = {
      roles: ['ASISTENTE' as const],
      permisos,
      area: '04' as const,
      accion: 'leer' as const,
    };
    expect(evaluarPermiso({ ...base, expedienteId: 'exp-x' }).permitido).toBe(true);
    expect(evaluarPermiso(base).permitido).toBe(false);
  });

  it('con varios roles basta con que uno lo permita', () => {
    expect(
      evaluarPermiso({
        roles: ['OPERACIONES', 'CONTADORA'],
        permisos: [],
        area: '02',
        accion: 'leer',
      }).permitido,
    ).toBe(true);
  });

  it('sin roles deniega', () => {
    expect(evaluarPermiso({ roles: [], permisos: [], area: '01', accion: 'leer' }).permitido).toBe(
      false,
    );
  });
});
