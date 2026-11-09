import { SetMetadata } from '@nestjs/common';
import type { Accion, AreaCodigo } from '@zulu/shared';

export const REQUIERE_PERMISO = 'zulu:requiere-permiso';
export const REQUIERE_CONDOMINIO = 'zulu:requiere-condominio';

export interface MetaPermiso {
  area: AreaCodigo;
  accion: Accion;
}

export interface MetaCondominio {
  /** Gestión de membresías/permisos: solo ADMINISTRADORA del condominio o superadmin. */
  gestion?: boolean;
}

/**
 * Exige contexto de condominio (`X-Condominio-Id`) y permiso sobre área y acción.
 * Si la ruta tiene `:expedienteId`, se evalúan también las reglas por expediente.
 */
export const RequierePermiso = (area: AreaCodigo, accion: Accion) =>
  SetMetadata(REQUIERE_PERMISO, { area, accion } satisfies MetaPermiso);

/** Exige contexto de condominio sin un permiso de área concreto. */
export const RequiereCondominio = (meta: MetaCondominio = {}) =>
  SetMetadata(REQUIERE_CONDOMINIO, meta);
