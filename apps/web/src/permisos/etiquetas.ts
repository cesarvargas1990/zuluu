import type { Accion, Rol } from '@zulu/shared';

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMINISTRADORA: 'Administrador',
  ASISTENTE: 'Asistente administrativo',
  CONTADORA: 'Contador',
  ASESOR_JURIDICO: 'Asesor jurídico',
  OPERACIONES: 'Operaciones / mantenimiento',
  CONSEJO: 'Consejo',
};

export const NOMBRE_ACCION: Record<Accion, string> = {
  leer: 'Leer',
  crear: 'Crear',
  editar: 'Editar',
  aprobar: 'Aprobar',
  exportar: 'Exportar',
  eliminar: 'Eliminar',
};
