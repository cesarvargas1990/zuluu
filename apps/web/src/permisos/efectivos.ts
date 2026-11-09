import { ACCIONES, permisosPorDefecto, type Accion, type AreaCodigo, type Rol } from '@zulu/shared';

interface PermisoArea {
  area: string;
  accion: Accion;
  efecto: 'CONCEDER' | 'RESTRINGIR';
  expedienteId: string | null;
}

export interface AccionEfectiva {
  accion: Accion;
  origen: 'rol' | 'concedido';
}

/**
 * Acciones efectivas a nivel de área (misma precedencia que el API: restricción > concesión > rol).
 * Los permisos de un expediente concreto no cambian el área completa.
 */
export function permisosEfectivos(
  rol: Rol,
  area: AreaCodigo,
  permisos: readonly PermisoArea[],
): AccionEfectiva[] {
  const delArea = permisos.filter((p) => p.area === area && p.expedienteId === null);
  const tiene = (accion: Accion, efecto: PermisoArea['efecto']) =>
    delArea.some((p) => p.accion === accion && p.efecto === efecto);
  const delRol = permisosPorDefecto(rol, area);

  return ACCIONES.flatMap<AccionEfectiva>((accion) => {
    if (tiene(accion, 'RESTRINGIR')) return [];
    if (delRol.includes(accion)) return [{ accion, origen: 'rol' }];
    if (tiene(accion, 'CONCEDER')) return [{ accion, origen: 'concedido' }];
    return [];
  });
}
