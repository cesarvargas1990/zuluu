import { describe, expect, it } from 'vitest';
import { MATRIZ_PERMISOS, ROLES_CON_MFA, permisosPorDefecto } from './permisos';
import { ROLES } from './roles';

describe('MATRIZ_PERMISOS', () => {
  it('define una entrada para cada rol', () => {
    expect(Object.keys(MATRIZ_PERMISOS).sort()).toEqual([...ROLES].sort());
  });

  it('CONSEJO no tiene permisos por defecto', () => {
    expect(MATRIZ_PERMISOS.CONSEJO).toEqual({});
  });

  it('ASISTENTE no aprueba en Finanzas ni accede a Jurídica', () => {
    expect(permisosPorDefecto('ASISTENTE', '02')).toEqual(['leer', 'crear']);
    expect(permisosPorDefecto('ASISTENTE', '04')).toEqual([]);
  });

  it('ADMINISTRADORA tiene todas las acciones en todas las áreas', () => {
    expect(permisosPorDefecto('ADMINISTRADORA', '06')).toEqual([
      'leer',
      'crear',
      'editar',
      'aprobar',
      'exportar',
      'eliminar',
    ]);
  });

  it('CONTADORA aprueba en Finanzas y solo lee en Administración', () => {
    expect(permisosPorDefecto('CONTADORA', '02')).toContain('aprobar');
    expect(permisosPorDefecto('CONTADORA', '01')).toEqual(['leer']);
  });

  it('OPERACIONES no accede a Finanzas', () => {
    expect(permisosPorDefecto('OPERACIONES', '02')).toEqual([]);
  });
});

describe('ROLES_CON_MFA', () => {
  it('incluye perfiles privilegiados y excluye ASISTENTE', () => {
    expect([...ROLES_CON_MFA].sort()).toEqual(['ADMINISTRADORA', 'ASESOR_JURIDICO', 'CONTADORA']);
  });
});

describe('AREA_CODIGOS', () => {
  it('está en orden 01 → 10', async () => {
    const { AREA_CODIGOS } = await import('./areas');
    expect(AREA_CODIGOS).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  });
});
