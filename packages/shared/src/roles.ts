/**
 * Roles por condominio (§2). Debe coincidir con el enum `Rol` de Prisma.
 * El superadministrador ZULU no es un rol de condominio: es `usuario.es_superadmin`.
 */
export const ROLES = [
  'ADMINISTRADORA',
  'ASISTENTE',
  'CONTADORA',
  'ASESOR_JURIDICO',
  'OPERACIONES',
  'CONSEJO',
] as const;
export type Rol = (typeof ROLES)[number];

/** Acciones sobre las que se otorgan permisos (por condominio, área y expediente). */
export const ACCIONES = ['leer', 'crear', 'editar', 'aprobar', 'exportar', 'eliminar'] as const;
export type Accion = (typeof ACCIONES)[number];
