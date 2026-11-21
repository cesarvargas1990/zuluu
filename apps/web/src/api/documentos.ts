import { api, apiArchivo } from './cliente';

export interface ExpedienteDigital {
  id: string; area: string; areaNombre: string; codigo: string; titulo: string; asunto: string | null; responsable: string | null;
  propietario: string | null; villa: string | null; estado: string; confidencial: boolean; fechaVencimiento: string | null; vencimientoVerificado: boolean;
  alerta?: string; _count?: { documentos: number; actuaciones: number; obligaciones: number };
}
export interface DetalleDocumento extends ExpedienteDigital {
  documentos: { id: string; nombre: string; categoria: string; radicado: string | null; estado: string; versiones: { id: string; numero: number; nombreArchivo: string; mimeType: string; tamano: number; sha256: string; createdAt: string }[]; relaciones: { id: string; entidadTipo: string; entidadId: string; motivo: string | null }[] }[];
  actuaciones: { id: string; tipo: string; descripcion: string; radicado: string | null; fechaActuacion: string }[];
  obligaciones: { id: string; titulo: string; responsable: string | null; estado: string; fechaVencimiento: string | null; vencimientoVerificado: boolean }[];
  compartidos: { usuarioId: string; puedeDescargar: boolean }[];
}
export const documentosApi = {
  buscar: (buscar = '', area = '') => api<ExpedienteDigital[]>(`/documentos?buscar=${encodeURIComponent(buscar)}${area ? `&area=${area}` : ''}`),
  crearExpediente: (data: Record<string, unknown>) => api('/documentos/expedientes', { metodo: 'POST', cuerpo: data }),
  detalle: (id: string) => api<DetalleDocumento>(`/documentos/expedientes/${id}`),
  exportar: (id: string) => apiArchivo(`/documentos/expedientes/${id}/exportar`),
  reporte: (id?: string) => apiArchivo(id ? `/documentos/expedientes/${id}/reporte` : '/documentos/reportes/consolidado'),
  subir: (id: string, data: FormData) => api(`/documentos/expedientes/${id}/documentos`, { metodo: 'POST', cuerpo: data }),
  version: (id: string, docId: string, data: FormData) => api(`/documentos/expedientes/${id}/documentos/${docId}/versiones`, { metodo: 'POST', cuerpo: data }),
  estadoDocumento: (id: string, docId: string, estado: string) => api(`/documentos/expedientes/${id}/documentos/${docId}`, { metodo: 'PATCH', cuerpo: { estado } }),
  descargar: (id: string, docId: string, versionId: string) => apiArchivo(`/documentos/expedientes/${id}/documentos/${docId}/versiones/${versionId}`),
  actuacion: (id: string, data: Record<string, unknown>) => api(`/documentos/expedientes/${id}/actuaciones`, { metodo: 'POST', cuerpo: data }),
  obligacion: (id: string, data: Record<string, unknown>) => api(`/documentos/expedientes/${id}/obligaciones`, { metodo: 'POST', cuerpo: data }),
  actualizarObligacion: (id: string, obligacionId: string, estado: string) => api(`/documentos/expedientes/${id}/obligaciones/${obligacionId}`, { metodo: 'PATCH', cuerpo: { estado } }),
  relacion: (documentoId: string, data: Record<string, unknown>) => api(`/documentos/documentos/${documentoId}/relaciones`, { metodo: 'POST', cuerpo: data }),
  compartir: (id: string, usuarioId: string, puedeDescargar: boolean) => api(`/documentos/expedientes/${id}/compartir`, { metodo: 'POST', cuerpo: { usuarioId, puedeDescargar } }),
  revocar: (id: string, usuarioId: string) => api(`/documentos/expedientes/${id}/compartir/${usuarioId}`, { metodo: 'DELETE' }),
};
