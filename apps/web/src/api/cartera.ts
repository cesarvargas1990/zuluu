import { api, apiArchivo } from './cliente';
export interface ObligacionCartera {
  id: string;
  numero: number;
  unidadId: string;
  unidad: { codigo: string; tipo: 'VILLA' | 'LOTE' };
  propietarios: { id: string; nombre: string }[];
  concepto: string;
  periodo: string;
  descripcion: string | null;
  fechaVencimiento: string;
  valor: string;
  saldo: string;
  estado: string;
  diasMora: number;
  tramo: string;
  movimientos: { tipo: string; valor: string; fecha: string; descripcion: string | null }[];
}
export interface ResumenCartera {
  total: string;
  obligaciones: number;
  vencido: string;
  porTramo: Record<string, number>;
}
export async function obtenerCartera(params: Record<string, string> = {}) {
  const q = new URLSearchParams(params);
  return api<{ resumen: ResumenCartera; obligaciones: ObligacionCartera[] }>(`/cartera?${q}`);
}
export async function exportarCartera(params: Record<string, string> = {}) {
  const q = new URLSearchParams(params);
  return api<ObligacionCartera[]>(`/cartera/exportar?${q}`);
}
export async function descargarCartera(
  formato: 'excel' | 'pdf',
  params: Record<string, string> = {},
) {
  const q = new URLSearchParams(params);
  return apiArchivo(`/cartera/exportar/${formato}?${q}`);
}
export async function previsualizarSaldos(archivo: File, fechaCorte: string) {
  const body = new FormData();
  body.append('archivo', archivo);
  body.append('fechaCorte', fechaCorte);
  return api<{
    id: string;
    resumen: { total: number; validas: number; errores: number; valor: string };
    filas: { fila: number; resultado: string }[];
  }>('/cartera/importaciones/previsualizar', { metodo: 'POST', cuerpo: body });
}
export async function aprobarSaldos(id: string) {
  return api<{ filas: number; estado: string }>(`/cartera/importaciones/${id}/aprobar`, {
    metodo: 'POST',
    cuerpo: {},
  });
}
