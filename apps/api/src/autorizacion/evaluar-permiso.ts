import { permisosPorDefecto, type Accion, type AreaCodigo, type Rol } from '@zulu/shared';

export interface PermisoExplicito {
  area: string;
  accion: Accion;
  efecto: 'CONCEDER' | 'RESTRINGIR';
  expedienteId: string | null;
}

export interface EntradaPermiso {
  roles: readonly Rol[];
  permisos: readonly PermisoExplicito[];
  area: AreaCodigo;
  accion: Accion;
  expedienteId?: string;
}

export interface ResultadoPermiso {
  permitido: boolean;
  motivo: 'restriccion' | 'concesion' | 'rol' | 'sin_permiso';
}

/** Un permiso explícito aplica si es de área completa o del expediente consultado. */
const aplica = (p: PermisoExplicito, e: EntradaPermiso): boolean =>
  p.area === e.area &&
  p.accion === e.accion &&
  (p.expedienteId === null || p.expedienteId === e.expedienteId);

/**
 * Precedencia: restricción explícita > concesión explícita > matriz del rol > denegar.
 * Función pura: el guard carga los datos y esta decide.
 */
export function evaluarPermiso(e: EntradaPermiso): ResultadoPermiso {
  const aplicables = e.permisos.filter((p) => aplica(p, e));
  if (aplicables.some((p) => p.efecto === 'RESTRINGIR')) {
    return { permitido: false, motivo: 'restriccion' };
  }
  if (aplicables.some((p) => p.efecto === 'CONCEDER')) {
    return { permitido: true, motivo: 'concesion' };
  }
  if (e.roles.some((rol) => permisosPorDefecto(rol, e.area).includes(e.accion))) {
    return { permitido: true, motivo: 'rol' };
  }
  return { permitido: false, motivo: 'sin_permiso' };
}
