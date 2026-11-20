import { api, apiArchivo } from './cliente';

export type EstadoCuentaCobro =
  'BORRADOR' | 'PENDIENTE_APROBACION' | 'APROBADO' | 'EMITIDO' | 'ANULADO';
export interface EnvioCuentaCobro {
  id: string;
  canal: string;
  destinatario: string;
  estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO';
  detalle: string | null;
  createdAt: string;
}
export interface PeriodoCobro {
  id: string;
  periodo: string;
  fechaCorte: string;
  fechaVencimiento: string;
  estado: string;
  conceptos: { id: string; nombre: string; descripcion: string | null; activo: boolean }[];
  _count: { cuentas: number };
}
export interface CuentaCobro {
  id: string;
  numero: string | null;
  estado: EstadoCuentaCobro;
  version: number;
  pdfDisponible: boolean;
  periodo: string;
  fechaCorte: string;
  fechaVencimiento: string;
  total: string;
  unidad: {
    codigo: string;
    tipo: 'VILLA' | 'LOTE';
    titularidades: { propietario: { id: string; nombre: string; correo: string | null } }[];
  };
  snapshot: {
    propietarios: { id: string; nombre: string; correo: string | null }[];
    lineas: { concepto: string; periodo: string; saldo: string; clase: string }[];
    observaciones: string[];
  };
  emitidoEn: string | null;
  aprobadoEn: string | null;
  envios: EnvioCuentaCobro[];
}
export interface ResultadoCuentasCobro {
  periodos: PeriodoCobro[];
  cuentas: CuentaCobro[];
}

export const cuentasCobroApi = {
  listar: () => api<ResultadoCuentasCobro>('/cuentas-cobro'),
  crearPeriodo: (datos: {
    periodo: string;
    fechaCorte: string;
    fechaVencimiento: string;
    conceptos: { nombre: string; descripcion?: string }[];
  }) => api<PeriodoCobro>('/cuentas-cobro/periodos', { metodo: 'POST', cuerpo: datos }),
  generar: (periodoId: string) =>
    api<{ creadas: number; duplicadas: number; sinSaldo: number; observadas: number }>(
      `/cuentas-cobro/periodos/${periodoId}/generar`,
      { metodo: 'POST' },
    ),
  generarUnidad: (periodoId: string, unidadId: string) =>
    api<{ creadas: number; duplicadas: number; sinSaldo: number; observadas: number }>(
      `/cuentas-cobro/periodos/${periodoId}/generar-unidad/${unidadId}`,
      { metodo: 'POST' },
    ),
  aprobar: (id: string) => api(`/cuentas-cobro/${id}/aprobar`, { metodo: 'POST' }),
  emitir: (id: string) =>
    api<{ id: string; estado: string; numero: string }>(`/cuentas-cobro/${id}/emitir`, {
      metodo: 'POST',
    }),
  pdf: (id: string) => apiArchivo(`/cuentas-cobro/${id}/pdf`),
  registrarEnvio: (
    id: string,
    datos: { canal: 'CORREO' | 'PRESENCIAL' | 'OTRO'; destinatario: string },
  ) => api<EnvioCuentaCobro>(`/cuentas-cobro/${id}/envios`, { metodo: 'POST', cuerpo: datos }),
  anular: (id: string, motivo: string) =>
    api(`/cuentas-cobro/${id}/anular`, { metodo: 'POST', cuerpo: { motivo } }),
};
