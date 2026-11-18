import { ROLES_CON_MFA, type Rol } from '@zulu/shared';

export type PoliticaMfa = 'HEREDAR' | 'OBLIGATORIO' | 'NO_REQUERIDO';

/** Por qué se exige (o no) la verificación en dos pasos; se muestra tal cual en la pantalla de parámetros. */
export type MotivoMfa =
  'GLOBAL_APAGADO' | 'USUARIO_OBLIGATORIO' | 'USUARIO_EXENTO' | 'ROL' | 'NINGUNO';

export interface EntradaMfa {
  /** Control global del sistema. */
  global: boolean;
  /** Ajuste individual del usuario. */
  politica: PoliticaMfa;
  esSuperadmin: boolean;
  /** Roles activos del usuario en sus condominios. */
  roles: readonly Rol[];
}

/**
 * La regla global prima: apagada, nadie necesita 2FA aunque un usuario lo tenga obligatorio.
 * Encendida, el ajuste individual decide; sin ajuste rige la regla por rol de siempre.
 */
export function decidirMfa(e: EntradaMfa): { requerido: boolean; motivo: MotivoMfa } {
  if (!e.global) return { requerido: false, motivo: 'GLOBAL_APAGADO' };
  if (e.politica === 'OBLIGATORIO') return { requerido: true, motivo: 'USUARIO_OBLIGATORIO' };
  if (e.politica === 'NO_REQUERIDO') return { requerido: false, motivo: 'USUARIO_EXENTO' };
  const porRol = e.esSuperadmin || e.roles.some((r) => ROLES_CON_MFA.has(r));
  return porRol ? { requerido: true, motivo: 'ROL' } : { requerido: false, motivo: 'NINGUNO' };
}
