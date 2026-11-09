import { describe, expect, it } from 'vitest';
import { permisosEfectivos } from './efectivos';

const p = (
  accion: string,
  efecto: 'CONCEDER' | 'RESTRINGIR',
  area = '04',
  expedienteId: string | null = null,
) => ({ area, accion, efecto, expedienteId }) as Parameters<typeof permisosEfectivos>[2][number];

describe('permisosEfectivos', () => {
  it('sin explícitos devuelve la matriz del rol con origen "rol"', () => {
    expect(permisosEfectivos('CONTADORA', '01', [])).toEqual([{ accion: 'leer', origen: 'rol' }]);
  });

  it('una concesión agrega la acción con origen "concedido"', () => {
    expect(permisosEfectivos('ASISTENTE', '04', [p('leer', 'CONCEDER')])).toEqual([
      { accion: 'leer', origen: 'concedido' },
    ]);
  });

  it('una restricción quita la acción aunque el rol la tenga', () => {
    const r = permisosEfectivos('ADMINISTRADORA', '04', [p('eliminar', 'RESTRINGIR')]);
    expect(r.map((x) => x.accion)).not.toContain('eliminar');
    expect(r).toHaveLength(5);
  });

  it('ignora permisos de otra área y los de un expediente concreto', () => {
    const r = permisosEfectivos('ASISTENTE', '04', [
      p('leer', 'CONCEDER', '03'),
      p('crear', 'CONCEDER', '04', 'exp-1'),
    ]);
    expect(r).toEqual([]);
  });

  it('respeta el orden canónico de acciones', () => {
    const r = permisosEfectivos('OPERACIONES', '05', [p('exportar', 'CONCEDER', '05')]);
    expect(r.map((x) => x.accion)).toEqual(['leer', 'crear', 'editar', 'exportar']);
  });
});
