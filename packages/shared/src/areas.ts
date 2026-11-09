/** Áreas documentales (§5). */
export const AREAS = {
  '01': 'Administración',
  '02': 'Finanzas y cartera',
  '03': 'Contratos',
  '04': 'Jurídica y convivencia',
  '05': 'Infraestructura',
  '06': 'Ambiental y agua',
  '07': 'Seguridad',
  '08': 'PQRS',
  '09': 'Consejo y asambleas',
  '10': 'Personal y proveedores',
} as const;
export type AreaCodigo = keyof typeof AREAS;

/** Estados de evidencia (§5). "radicado" nunca equivale a "aprobado". */
export const ESTADOS_EVIDENCIA = [
  'recibido',
  'pendiente_validar',
  'validado',
  'observado',
  'sustituido',
  'archivado',
] as const;
export type EstadoEvidencia = (typeof ESTADOS_EVIDENCIA)[number];
