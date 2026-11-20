import { api, apiArchivo } from './cliente';

export type EstadoProceso = 'POR_VERIFICAR' | 'SOLICITADO' | 'RADICADO' | 'REQUERIDO' | 'PRORROGADO' | 'EN_TRAMITE' | 'APROBADO' | 'NEGADO' | 'DESISTIDO' | 'CERRADO';
export interface ProcesoAmbiental {
  id: string; codigo: string; titulo: string; autoridad: string | null; numeroExpediente: string | null; radicado: string | null;
  objeto: string | null; antecedente: string | null; proximoPaso: string | null; estadoJuridico: EstadoProceso; estadoTecnico: EstadoProceso;
  prioridad: string; responsable: string | null; fechaExpedicion: string | null; fechaRecepcion: string | null; fechaNotificacion: string | null;
  notificacionVerificada: boolean; plazoDias: number | null; metodoComputo: string | null; fechaVencimientoValidada: string | null;
  vencimientoVerificado: boolean; costoEstimado: string | null; conteos: { actuaciones: number; obligaciones: number; documentos: number };
  alerta: { nivel: string; texto: string }; totalPendienteConciliar: string; accionesPermitidas: ('leer'|'crear'|'editar'|'aprobar'|'exportar')[];
}
export interface DetalleAmbiental {
  proceso: ProcesoAmbiental;
  actuaciones: { id: string; asunto: string; tipo: string; entidad: string | null; radicado: string | null; descripcion: string; fechaExpedicion: string | null; fechaRecepcion: string | null; fechaNotificacion: string | null; estado: string; responsable: string | null; createdAt: string }[];
  obligaciones: { id: string; titulo: string; descripcion: string | null; responsable: string | null; estado: string; fechaNotificacion: string | null; notificacionValidada: boolean; plazoDias: number | null; fechaVencimiento: string | null; vencimientoValidado: boolean; prioridad: string; evidenciaCierre: string | null }[];
  documentos: { id: string; nombre: string; tipo: string; mimeType: string; tamano: number; sha256: string; verificacion: string; createdAt: string; procesoPrincipal: { id: string; codigo: string; titulo: string }; relaciones: { id: string; codigo: string; titulo: string }[] }[];
  finanzas: { id: string; tipo: string; concepto: string; valor: string; fecha: string | null; referencia: string | null; estado: string; nota: string | null }[];
  relaciones: { id: string; codigo: string; titulo: string; motivo: string; direccion: string }[];
  auditoria: { id: string; accion: string; actorId: string | null; createdAt: string; antes: unknown; despues: unknown }[];
}

export const ambientalApi = {
  listar: (buscar = '') => api<ProcesoAmbiental[]>(`/ambiental${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
  detalle: (id: string) => api<DetalleAmbiental>(`/ambiental/${id}`),
  actualizar: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}`, { metodo: 'PATCH', cuerpo: datos }),
  cambiarEstado: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/estado`, { metodo: 'PATCH', cuerpo: datos }),
  actuacion: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/actuaciones`, { metodo: 'POST', cuerpo: datos }),
  obligacion: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/obligaciones`, { metodo: 'POST', cuerpo: datos }),
  actualizarObligacion: (id: string, obligacionId: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/obligaciones/${obligacionId}`, { metodo: 'PATCH', cuerpo: datos }),
  documento: (id: string, datos: FormData) => api(`/ambiental/${id}/documentos`, { metodo: 'POST', cuerpo: datos }),
  verificarDocumento: (id: string, documentoId: string, verificacion: 'VALIDADO' | 'OBSERVADO' | 'ARCHIVADO') => api(`/ambiental/${id}/documentos/${documentoId}`, { metodo: 'PATCH', cuerpo: { verificacion } }),
  relacionarDocumento: (id: string, documentoId: string, datos: { destinoId: string; motivo: string }) => api(`/ambiental/${id}/documentos/${documentoId}/relaciones`, { metodo: 'POST', cuerpo: datos }),
  descargarDocumento: (id: string, docId: string) => apiArchivo(`/ambiental/${id}/documentos/${docId}`),
  finanza: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/finanzas`, { metodo: 'POST', cuerpo: datos }),
  relacion: (id: string, datos: Record<string, unknown>) => api(`/ambiental/${id}/relaciones`, { metodo: 'POST', cuerpo: datos }),
  informe: (id?: string) => apiArchivo(id ? `/ambiental/${id}/reportes` : '/ambiental/reportes/resumen'),
};
