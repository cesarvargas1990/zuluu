import type { AreaCodigo } from './areas';
import { ACCIONES, type Accion, type Rol } from './roles';

type MatrizRol = Partial<Record<AreaCodigo, readonly Accion[]>>;

const TODAS = ACCIONES;
const LCE: readonly Accion[] = ['leer', 'crear', 'editar'];
const LC: readonly Accion[] = ['leer', 'crear'];
const L: readonly Accion[] = ['leer'];

const todasLasAreas = (acciones: readonly Accion[]): MatrizRol =>
  Object.fromEntries(
    (['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const).map((a) => [
      a,
      acciones,
    ]),
  );

/**
 * Permisos por defecto de cada rol (borrador; validar con ZULU).
 * Las concesiones y restricciones explícitas por membresía se aplican encima.
 */
export const MATRIZ_PERMISOS: Readonly<Record<Rol, MatrizRol>> = {
  ADMINISTRADORA: todasLasAreas(TODAS),
  ASISTENTE: {
    '01': LCE,
    '03': LCE,
    '05': LCE,
    '06': LCE,
    '07': LCE,
    '08': LCE,
    '09': LCE,
    '10': LCE,
    '02': ['crear'],
  },
  CONTADORA: {
    '02': ['leer', 'crear', 'editar', 'aprobar', 'exportar'],
    '01': L,
    '03': L,
    '10': L,
  },
  ASESOR_JURIDICO: { '04': ['leer', 'crear', 'editar', 'exportar'], '03': LCE, '02': L },
  OPERACIONES: { '05': LCE, '06': LC, '07': LC },
  CONSEJO: {},
};

/** Roles que exigen MFA (además del superadministrador ZULU). */
export const ROLES_CON_MFA: ReadonlySet<Rol> = new Set<Rol>([
  'ADMINISTRADORA',
  'CONTADORA',
  'ASESOR_JURIDICO',
]);

export const permisosPorDefecto = (rol: Rol, area: AreaCodigo): readonly Accion[] =>
  MATRIZ_PERMISOS[rol][area] ?? [];
