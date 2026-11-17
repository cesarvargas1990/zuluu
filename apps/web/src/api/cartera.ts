import { api, apiArchivo } from './cliente';
import type { TipoUnidadPrivada } from './propietarios';
import type { ConceptoImputacion, EstadoRecaudo } from './recaudos';

export type Tramo = 'CORRIENTE' | '01_30' | '31_60' | '61_90' | 'MAS_90';
export type EstadoUnidadCartera = 'AL_DIA' | 'CORRIENTE' | 'VENCIDA';
export type EstadoObligacion = 'PENDIENTE' | 'PARCIAL' | 'PAGADA';
export type TipoMovimiento =
  'CARGO' | 'PAGO' | 'REVERSO_PAGO' | 'AJUSTE_DEBITO' | 'AJUSTE_CREDITO' | 'CREDITO_APLICADO';
export type Canal = 'TELEFONO' | 'CORREO' | 'WHATSAPP' | 'PRESENCIAL' | 'CARTA' | 'OTRO';
export type EstadoCompromiso = 'ABIERTO' | 'CUMPLIDO' | 'INCUMPLIDO' | 'CANCELADO';
export type EstadoAjuste = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type TipoReporte = 'general' | 'vencida' | 'estado-cuenta' | 'gestiones';

interface UnidadRef {
  id: string;
  codigo: string;
  tipo: TipoUnidadPrivada;
}
type PorTramo = Record<Tramo, string>;

/** Los valores en dinero llegan como texto decimal. */
export interface UnidadCartera {
  unidad: UnidadRef;
  propietarios: { id: string; nombre: string }[];
  saldo: string;
  vencido: string;
  corriente: string;
  porTramo: PorTramo;
  saldoAFavor: string;
  obligacionesAbiertas: number;
  periodoMasAntiguo: string | null;
  diasMora: number;
  estado: EstadoUnidadCartera;
  compromisosAbiertos: number;
  ultimaGestion: string | null;
  proximaGestion: string | null;
}
export interface ResumenCartera {
  total: string;
  vencido: string;
  corriente: string;
  saldoAFavor: string;
  unidades: number;
  unidadesConSaldo: number;
  unidadesVencidas: number;
  obligacionesAbiertas: number;
  compromisosAbiertos: number;
  porTramo: PorTramo;
}
export interface Obligacion {
  id: string;
  numeroVisible: string;
  unidadId: string;
  unidad: UnidadRef;
  propietarios: { id: string; nombre: string }[];
  concepto: ConceptoImputacion;
  periodo: string;
  descripcion: string | null;
  origen: 'MANUAL' | 'GENERACION' | 'IMPORTACION';
  fechaEmision: string;
  fechaVencimiento: string;
  valor: string;
  cargos: string;
  pagos: string;
  creditos: string;
  saldo: string;
  estado: EstadoObligacion;
  vencida: boolean;
  diasMora: number;
  tramo: Tramo;
}
export interface Movimiento {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  obligacionId: string;
  obligacion: string;
  concepto: ConceptoImputacion;
  periodo: string;
  descripcion: string | null;
  recaudo: string | null;
  cargo: string | null;
  abono: string | null;
  saldo: string;
}
export interface Gestion {
  id: string;
  unidadId: string;
  unidad?: UnidadRef;
  fecha: string;
  canal: Canal;
  contacto: string | null;
  resultado: string;
  proximaFecha: string | null;
  responsable: string | null;
  compromisos?: { id: string; valor: string; fechaPactada: string; estado: EstadoCompromiso }[];
}
export interface Compromiso {
  id: string;
  unidadId: string;
  unidad?: UnidadRef;
  fechaPactada: string;
  valor: string;
  estado: EstadoCompromiso;
  observaciones: string | null;
  responsable: string | null;
  vencido?: boolean;
}
export interface Ajuste {
  id: string;
  obligacionId: string;
  tipo: 'DEBITO' | 'CREDITO';
  valor: string;
  motivo: string;
  soporte: string | null;
  estado: EstadoAjuste;
  notaResolucion: string | null;
  resueltoEn: string | null;
  createdAt: string;
  solicitadoPorNombre: string | null;
  resueltoPorNombre: string | null;
  esPropio?: boolean;
  unidad?: UnidadRef;
  obligacion?: {
    numeroVisible: string;
    concepto: ConceptoImputacion;
    periodo: string;
    valor: string;
  };
}
export interface EstadoDeCuenta {
  corte: string;
  unidad: UnidadRef & { activa: boolean };
  propietarios: { id: string; nombre: string }[];
  totales: {
    cargos: string;
    pagos: string;
    creditos: string;
    saldo: string;
    vencido: string;
    saldoAFavor: string;
    porTramo: PorTramo;
  };
  obligaciones: Obligacion[];
  movimientos: Movimiento[];
  gestiones: Gestion[];
  compromisos: Compromiso[];
  recaudosSinVerificar: {
    id: string;
    numeroVisible: string;
    fechaPago: string;
    valor: string;
    estado: EstadoRecaudo;
  }[];
}
export interface DetalleObligacion extends Omit<Obligacion, 'unidadId'> {
  creadoPorNombre: string | null;
  createdAt: string;
  movimientos: Movimiento[];
  ajustes: Ajuste[];
  historial: { id: string; accion: string; actor: string; despues: unknown; createdAt: string }[];
}
export type ResultadoFilaSaldo = 'VALIDA' | 'ADVERTENCIA' | 'DUPLICADO' | 'ERROR';
export interface VistaSaldos {
  id: string;
  archivo: string;
  fechaCorte: string;
  filas: {
    fila: number;
    resultado: ResultadoFilaSaldo;
    mensajes: string[];
    unidad: string;
    periodo: string | null;
    fechaVencimiento: string | null;
    valor: string | null;
    descripcion: string | null;
  }[];
  resumen: {
    total: number;
    validas: number;
    advertencias: number;
    duplicados: number;
    errores: number;
    valor: string;
  };
}

export type Filtros = Record<string, string | undefined>;
const consulta = (f: Filtros) => {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(f)) if (valor) p.set(clave, valor);
  const texto = p.toString();
  return texto ? `?${texto}` : '';
};

export const carteraApi = {
  listar: (f: Filtros = {}) =>
    api<{ corte: string; resumen: ResumenCartera; unidades: UnidadCartera[] }>(
      `/cartera${consulta(f)}`,
    ),
  obligaciones: (f: Filtros = {}) =>
    api<{
      corte: string;
      resumen: { obligaciones: number; valor: string; total: string; vencido: string };
      obligaciones: Obligacion[];
    }>(`/cartera/obligaciones${consulta(f)}`),
  detalleObligacion: (id: string) => api<DetalleObligacion>(`/cartera/obligaciones/${id}`),
  estadoDeCuenta: (unidadId: string, corte?: string) =>
    api<EstadoDeCuenta>(`/cartera/unidades/${unidadId}${consulta({ corte })}`),
  crearObligacion: (datos: Record<string, unknown>) =>
    api<{ id: string; numeroVisible: string }>('/cartera/obligaciones', {
      metodo: 'POST',
      cuerpo: datos,
    }),
  generar: (datos: { periodo: string; fechaEmision: string; fechaVencimiento: string }) =>
    api<{ creadas: number; valor: string; yaExistian: number; sinCuota: number }>(
      '/cartera/obligaciones/generar',
      { metodo: 'POST', cuerpo: datos },
    ),
  gestiones: (f: Filtros = {}) => api<Gestion[]>(`/cartera/gestiones${consulta(f)}`),
  crearGestion: (datos: Record<string, unknown>) =>
    api<Gestion & { compromiso: Compromiso | null }>('/cartera/gestiones', {
      metodo: 'POST',
      cuerpo: datos,
    }),
  compromisos: (f: Filtros = {}) => api<Compromiso[]>(`/cartera/compromisos${consulta(f)}`),
  cambiarCompromiso: (id: string, estado: Exclude<EstadoCompromiso, 'ABIERTO'>) =>
    api(`/cartera/compromisos/${id}/estado`, { metodo: 'POST', cuerpo: { estado } }),
  ajustes: (estado?: EstadoAjuste) => api<Ajuste[]>(`/cartera/ajustes${consulta({ estado })}`),
  solicitarAjuste: (datos: Record<string, unknown>) =>
    api<Ajuste>('/cartera/ajustes', { metodo: 'POST', cuerpo: datos }),
  resolverAjuste: (id: string, aprobar: boolean, nota: string) =>
    api(`/cartera/ajustes/${id}/resolver`, { metodo: 'POST', cuerpo: { aprobar, nota } }),
  previsualizarSaldos: (archivo: File, fechaCorte: string) => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    cuerpo.append('fechaCorte', fechaCorte);
    return api<VistaSaldos>('/cartera/importaciones/previsualizar', { metodo: 'POST', cuerpo });
  },
  aprobarSaldos: (id: string) =>
    api<{ creadas: number; omitidas: number; valor: string }>(
      `/cartera/importaciones/${id}/aprobar`,
      {
        metodo: 'POST',
      },
    ),
  descartarSaldos: (id: string) =>
    api(`/cartera/importaciones/${id}/descartar`, { metodo: 'POST' }),
  reporte: (tipo: TipoReporte, formato: 'xlsx' | 'pdf', f: Filtros = {}) =>
    apiArchivo(`/cartera/reportes/${tipo}${consulta({ ...f, formato })}`),
};
