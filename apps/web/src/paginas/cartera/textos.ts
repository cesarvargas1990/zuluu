import type {
  Canal,
  EstadoAjuste,
  EstadoCompromiso,
  EstadoUnidadCartera,
  Obligacion,
  TipoMovimiento,
  Tramo,
} from '@/api/cartera';
import type { TipoUnidadPrivada } from '@/api/propietarios';

export const TRAMOS: readonly [Tramo, string][] = [
  ['CORRIENTE', 'Corriente'],
  ['01_30', '1–30 días'],
  ['31_60', '31–60 días'],
  ['61_90', '61–90 días'],
  ['MAS_90', 'Más de 90 días'],
];
export const nombreTramo = (t: Tramo) => TRAMOS.find(([c]) => c === t)?.[1] ?? t;

export const nombreUnidad = (u: { codigo: string; tipo: TipoUnidadPrivada }) =>
  `${u.tipo === 'VILLA' ? 'Villa' : 'Lote'} · ${u.codigo}`;

export const ESTADO_UNIDAD: Record<
  EstadoUnidadCartera,
  { texto: string; tono: 'ok' | 'aviso' | 'error' }
> = {
  AL_DIA: { texto: 'Al día', tono: 'ok' },
  CORRIENTE: { texto: 'Corriente', tono: 'aviso' },
  VENCIDA: { texto: 'Vencida', tono: 'error' },
};

/** Estado en texto de una obligación: la mora se dice junto al estado, no solo con color. */
export function estadoObligacion(o: Pick<Obligacion, 'estado' | 'vencida' | 'diasMora'>): {
  texto: string;
  tono: 'ok' | 'aviso' | 'error' | 'info';
} {
  if (o.estado === 'PAGADA') return { texto: 'Pagada', tono: 'ok' };
  const base = o.estado === 'PARCIAL' ? 'Pago parcial' : 'Pendiente';
  return o.vencida
    ? {
        texto: `${base} · vencida ${o.diasMora} ${o.diasMora === 1 ? 'día' : 'días'}`,
        tono: 'error',
      }
    : { texto: base, tono: o.estado === 'PARCIAL' ? 'aviso' : 'info' };
}

export const MOVIMIENTO: Record<TipoMovimiento, string> = {
  CARGO: 'Cargo',
  PAGO: 'Pago verificado',
  REVERSO_PAGO: 'Reverso de pago',
  AJUSTE_DEBITO: 'Ajuste débito',
  AJUSTE_CREDITO: 'Ajuste crédito',
  CREDITO_APLICADO: 'Crédito aplicado',
};

export const CANALES: readonly [Canal, string][] = [
  ['TELEFONO', 'Teléfono'],
  ['WHATSAPP', 'WhatsApp'],
  ['CORREO', 'Correo'],
  ['PRESENCIAL', 'Presencial'],
  ['CARTA', 'Carta'],
  ['OTRO', 'Otro'],
];
export const nombreCanal = (c: Canal) => CANALES.find(([k]) => k === c)?.[1] ?? c;

export const COMPROMISO: Record<
  EstadoCompromiso,
  { texto: string; tono: 'ok' | 'aviso' | 'error' | 'info' }
> = {
  ABIERTO: { texto: 'Abierto', tono: 'aviso' },
  CUMPLIDO: { texto: 'Cumplido', tono: 'ok' },
  INCUMPLIDO: { texto: 'Incumplido', tono: 'error' },
  CANCELADO: { texto: 'Cancelado', tono: 'info' },
};
export const AJUSTE: Record<EstadoAjuste, { texto: string; tono: 'ok' | 'aviso' | 'error' }> = {
  PENDIENTE: { texto: 'Pendiente de autorización', tono: 'aviso' },
  APROBADO: { texto: 'Aprobado', tono: 'ok' },
  RECHAZADO: { texto: 'Rechazado', tono: 'error' },
};

const ACCIONES: Record<string, string> = {
  'cartera.obligacion_creada': 'Obligación registrada',
  'cartera.ajuste_solicitado': 'Ajuste solicitado',
  'cartera.ajuste_aprobado': 'Ajuste aprobado',
  'cartera.ajuste_rechazado': 'Ajuste rechazado',
};
export const nombreAccion = (a: string) => ACCIONES[a] ?? a;

export const mensajeDe = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
export const sinAnimacion = import.meta.env.MODE === 'test';
