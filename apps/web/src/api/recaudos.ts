import { api } from './cliente';
import type { TipoUnidadPrivada } from './propietarios';

export type MedioPago = 'TRANSFERENCIA' | 'CONSIGNACION' | 'EFECTIVO' | 'OTRO';
export type EstadoRecaudo = 'PENDIENTE' | 'VERIFICADO' | 'OBSERVADO' | 'ANULADO';
export type ConceptoImputacion =
  'CUOTA_ADMINISTRACION' | 'CUOTA_VENCIDA' | 'INTERESES' | 'CUOTA_EXTRAORDINARIA' | 'OTRO';

/** Los valores en dinero llegan como texto decimal ("580000", "580000.5"). */
export interface Recaudo {
  id: string;
  numero: number;
  numeroVisible: string;
  unidadId: string | null;
  propietarioId: string | null;
  pagador: string | null;
  fechaPago: string;
  valor: string;
  medio: MedioPago;
  referencia: string | null;
  banco: string | null;
  observacion: string | null;
  estado: EstadoRecaudo;
  origen: 'MANUAL' | 'IMPORTACION';
  posibleDuplicado: boolean;
  saldoAFavor: string;
  observacionVerificacion: string | null;
  revisadoEn: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  createdAt: string;
}

export interface RecaudoListado extends Recaudo {
  unidad: { id: string; codigo: string; tipo: TipoUnidadPrivada } | null;
  propietario: { id: string; nombre: string } | null;
  _count: { soportes: number };
}

export interface Imputacion {
  id: string;
  concepto: ConceptoImputacion;
  periodo: string;
  valorObligacion: string | null;
  valorAplicado: string;
  saldoPendiente: string | null;
}

export interface Soporte {
  id: string;
  nombre: string;
  mimeType: string;
  tamano: number;
  sha256: string;
  createdAt: string;
}

export interface EventoHistorial {
  id: string;
  accion: string;
  actor: string;
  antes: unknown;
  despues: unknown;
  createdAt: string;
}

export interface RecaudoDetalle extends Recaudo {
  unidad: { id: string; codigo: string; tipo: TipoUnidadPrivada } | null;
  propietario: { id: string; nombre: string } | null;
  creadoPorNombre: string | null;
  revisadoPorNombre: string | null;
  anuladoPorNombre: string | null;
  imputaciones: Imputacion[];
  soportes: Soporte[];
  historial: EventoHistorial[];
}

export interface ResumenRecaudos {
  total: number;
  valorRecibido: string;
  valorVerificado: string;
  saldoAFavor: string;
  pendientes: number;
  observados: number;
  verificados: number;
  anulados: number;
  sinIdentificar: number;
}

export interface FiltrosRecaudos {
  buscar?: string;
  estado?: EstadoRecaudo | '';
  medio?: MedioPago | '';
  unidadId?: string;
  propietarioId?: string;
  desde?: string;
  hasta?: string;
  bandeja?: 'identificar' | 'revision';
}

export interface PosibleDuplicado {
  id: string;
  numeroVisible: string;
  fechaPago: string;
  valor: string;
  referencia: string | null;
  estado: EstadoRecaudo;
  unidad: string | null;
}

export interface DatosPago {
  fechaPago: string;
  valor: string;
  medio: MedioPago;
  referencia?: string | null;
  banco?: string | null;
  pagador?: string | null;
  observacion?: string | null;
  unidadId?: string | null;
  propietarioId?: string | null;
}

export interface LineaImputacion {
  concepto: ConceptoImputacion;
  periodo: string;
  valorObligacion?: string | null;
  valorAplicado: string;
}

export type ResultadoFila = 'VALIDA' | 'ADVERTENCIA' | 'DUPLICADO' | 'ERROR';
export interface FilaImportacionPago {
  fila: number;
  resultado: ResultadoFila;
  mensajes: string[];
  datos: {
    fechaPago: string | null;
    valor: string | null;
    medio: MedioPago | null;
    unidad: string;
    referencia: string | null;
    pagador: string | null;
  };
}
export interface VistaImportacion {
  id: string;
  archivo: string;
  filas: FilaImportacionPago[];
  resumen: {
    total: number;
    validas: number;
    advertencias: number;
    duplicados: number;
    errores: number;
  };
}

const consulta = (f: FiltrosRecaudos) => {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(f)) if (valor) p.set(clave, valor);
  const texto = p.toString();
  return texto ? `?${texto}` : '';
};

const conArchivo = (archivo: File) => {
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo);
  return cuerpo;
};

export const recaudosApi = {
  listar: (f: FiltrosRecaudos = {}) =>
    api<{ items: RecaudoListado[]; resumen: ResumenRecaudos }>(`/recaudos${consulta(f)}`),
  exportar: (f: FiltrosRecaudos = {}) =>
    api<{ items: RecaudoListado[] }>(`/recaudos/exportar${consulta(f)}`),
  detalle: (id: string) => api<RecaudoDetalle>(`/recaudos/${id}`),
  registrar: (datos: DatosPago, confirmarDuplicado = false) =>
    api<Recaudo>('/recaudos', {
      metodo: 'POST',
      cuerpo: confirmarDuplicado ? { ...datos, confirmarDuplicado: true } : datos,
    }),
  modificar: (id: string, cambios: Partial<DatosPago>) =>
    api<RecaudoDetalle>(`/recaudos/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  subirSoporte: (id: string, archivo: File) =>
    api<Soporte>(`/recaudos/${id}/soportes`, { metodo: 'POST', cuerpo: conArchivo(archivo) }),
  obtenerSoporte: (id: string, soporteId: string) =>
    api<{ nombre: string; mimeType: string; contenido: string }>(
      `/recaudos/${id}/soportes/${soporteId}`,
    ),
  verificar: (id: string, imputaciones: LineaImputacion[], observacion?: string) =>
    api<RecaudoDetalle>(`/recaudos/${id}/verificar`, {
      metodo: 'POST',
      cuerpo: { imputaciones, observacion: observacion || null },
    }),
  observar: (id: string, observacion: string) =>
    api<RecaudoDetalle>(`/recaudos/${id}/observar`, { metodo: 'POST', cuerpo: { observacion } }),
  anular: (id: string, motivo: string) =>
    api<RecaudoDetalle>(`/recaudos/${id}/anular`, { metodo: 'POST', cuerpo: { motivo } }),
  leerArchivo: (archivo: File) =>
    api<{ archivo: string; columnas: string[]; filas: Array<Record<string, string>> }>(
      '/recaudos/importaciones/leer',
      { metodo: 'POST', cuerpo: conArchivo(archivo) },
    ),
  previsualizarImportacion: (
    archivo: string,
    filas: Array<Record<string, string>>,
    columnas: Record<string, string>,
  ) =>
    api<VistaImportacion>('/recaudos/importaciones/previsualizar', {
      metodo: 'POST',
      cuerpo: { archivo, filas, columnas },
    }),
  confirmarImportacion: (id: string, incluirDuplicados: boolean) =>
    api<{ creados: number; omitidos: number }>(`/recaudos/importaciones/${id}/confirmar`, {
      metodo: 'POST',
      cuerpo: { incluirDuplicados },
    }),
  descartarImportacion: (id: string) =>
    api(`/recaudos/importaciones/${id}/descartar`, { metodo: 'POST' }),
};
