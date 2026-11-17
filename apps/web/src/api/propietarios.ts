import { api } from './cliente';

export type TipoPersonaPropietaria = 'NATURAL' | 'JURIDICA';
export type TipoUnidadPrivada = 'VILLA' | 'LOTE';
export type TipoTitularidad = 'TITULAR' | 'COTITULAR';
export type EstadoTitularidad = 'PENDIENTE_VALIDAR' | 'VALIDADO' | 'OBSERVADO';

export interface Propietario {
  id: string;
  tipoPersona: TipoPersonaPropietaria;
  nombre: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  activo: boolean;
  titularidades: Array<{
    id: string;
    tipo: TipoTitularidad;
    estado: EstadoTitularidad;
    unidad: { id: string; codigo: string; tipo: TipoUnidadPrivada };
  }>;
}

export interface UnidadPrivada {
  id: string;
  codigo: string;
  tipo: TipoUnidadPrivada;
  areaM2: string | null;
  coeficiente: string | null;
  cuotaMensual: string | null;
  matriculaInmobiliaria: string | null;
  estadoJuridico: string | null;
  activa: boolean;
  titularidades: Array<{
    id: string;
    tipo: TipoTitularidad;
    estado: EstadoTitularidad;
    propietario: { id: string; nombre: string };
  }>;
}

export interface Titularidad {
  id: string;
  tipo: TipoTitularidad;
  estado: EstadoTitularidad;
  desde: string | null;
  hasta: string | null;
  fuente: string | null;
  soporte: string | null;
  propietario: {
    id: string;
    nombre: string;
    tipoDocumento: string | null;
    numeroDocumento: string | null;
    activo: boolean;
  };
  unidad: { id: string; codigo: string; tipo: TipoUnidadPrivada; activa: boolean };
}

export interface FilaImportacion {
  fila: number;
  unidadDesconocida?: boolean;
  datos: Record<string, string>;
  alertas: string[];
}

export const propietariosApi = {
  listarPropietarios: (buscar = '', estado = 'todos') =>
    api<Propietario[]>(`/propietarios?buscar=${encodeURIComponent(buscar)}&estado=${estado}`),
  crearPropietario: (datos: Record<string, unknown>) =>
    api<Propietario>('/propietarios', { metodo: 'POST', cuerpo: datos }),
  modificarPropietario: (id: string, cambios: Record<string, unknown>) =>
    api<Propietario>(`/propietarios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  listarUnidades: (buscar = '', estado = 'todas') =>
    api<UnidadPrivada[]>(`/unidades?buscar=${encodeURIComponent(buscar)}&estado=${estado}`),
  crearUnidad: (datos: Record<string, unknown>) =>
    api<UnidadPrivada>('/unidades', { metodo: 'POST', cuerpo: datos }),
  modificarUnidad: (id: string, cambios: Record<string, unknown>) =>
    api<UnidadPrivada>(`/unidades/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  listarTitularidades: (unidadId?: string) =>
    api<Titularidad[]>(`/titularidades${unidadId ? `?unidadId=${encodeURIComponent(unidadId)}` : ''}`),
  crearTitularidad: (datos: Record<string, unknown>) =>
    api<Titularidad>('/titularidades', { metodo: 'POST', cuerpo: datos }),
  cerrarTitularidad: (id: string, hasta: string) =>
    api<Titularidad>(`/titularidades/${id}/cerrar`, { metodo: 'POST', cuerpo: { hasta } }),
  revisarTitularidad: (id: string, estado: EstadoTitularidad) =>
    api<Titularidad>(`/titularidades/${id}/revisar`, { metodo: 'POST', cuerpo: { estado } }),
  detallePropietario: (id: string) => api<Omit<Propietario, 'titularidades'> & { titularidades: Array<Propietario['titularidades'][number] & { desde: string | null; hasta: string | null; unidad: { id: string; codigo: string; tipo: TipoUnidadPrivada } }> }>(`/propietarios/${id}`),
  detalleUnidad: (id: string) => api<Omit<UnidadPrivada, 'titularidades'> & { titularidades: Array<{ id: string; tipo: TipoTitularidad; estado: EstadoTitularidad; desde: string | null; hasta: string | null; propietario: { id: string; nombre: string; tipoDocumento: string | null; numeroDocumento: string | null } }> }>(`/unidades/${id}`),
  historialUnidad: (id: string) => api<Array<{ id: string; accion: string; actorId: string | null; antes: unknown; despues: unknown; createdAt: string }>>(`/unidades/${id}/auditoria`),
  historialPropietario: (id: string) => api<Array<{ id: string; accion: string; actorId: string | null; antes: unknown; despues: unknown; createdAt: string }>>(`/propietarios/${id}/auditoria`),
  listarDocumentos: (id: string) => api<Array<{ id: string; nombre: string; mimeType: string; tamano: number; createdAt: string }>>(`/propietarios/${id}/documentos`),
  subirDocumento: (id: string, archivo: File) => { const cuerpo = new FormData(); cuerpo.append('archivo', archivo); return api(`/propietarios/${id}/documentos`, { metodo: 'POST', cuerpo }); },
  obtenerDocumento: (id: string, documentoId: string) => api<{ nombre: string; mimeType: string; contenido: string }>(`/propietarios/${id}/documentos/${documentoId}`),
  leerExcel: (archivo: File) => { const cuerpo = new FormData(); cuerpo.append('archivo', archivo); return api<{ hoja: string; columnas: string[]; filas: Array<Record<string, string>> }>('/importaciones/leer', { metodo: 'POST', cuerpo }); },
  previsualizarImportacion: (archivo: string, filas: Array<Record<string, string>>, columnas: Record<string, string>) => api<{ id: string; estado: string; creadaEn: string; filas: FilaImportacion[]; resumen: { total: number; conAlertas: number; sinAlertas: number } }>('/importaciones/previsualizar', { metodo: 'POST', cuerpo: { archivo, filas, columnas } }),
  listarImportacionesPendientes: () => api<Array<{ id: string; archivo: string; resumen: { total: number; conAlertas: number; sinAlertas: number }; creadaPor: string; creadaEn: string }>>('/importaciones/pendientes'),
  detalleImportacion: (id: string) => api<{ id: string; archivo: string; estado: string; creadaPor: string; creadaEn: string; filas: FilaImportacion[]; resumen: { total: number; conAlertas: number; sinAlertas: number } }>(`/importaciones/${id}`),
  aprobarImportacion: (id: string, crearUnidadesDesconocidas: boolean) => api<{ propietarios: number; unidades: number; vinculaciones: number }>('/importaciones/aprobar', { metodo: 'POST', cuerpo: { id, crearUnidadesDesconocidas } }),
  rechazarImportacion: (id: string) => api(`/importaciones/${id}/rechazar`, { metodo: 'POST' }),
};
