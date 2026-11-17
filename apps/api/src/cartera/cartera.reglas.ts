import { Prisma, type TipoMovimientoCartera } from '@prisma/client';

/** Movimientos que aumentan el saldo de una obligación; los demás lo reducen. */
const AUMENTAN: ReadonlySet<TipoMovimientoCartera> = new Set([
  'CARGO',
  'REVERSO_PAGO',
  'AJUSTE_DEBITO',
]);

export const signoDe = (tipo: TipoMovimientoCartera) => (AUMENTAN.has(tipo) ? 1 : -1);

export const TRAMOS = ['CORRIENTE', '01_30', '31_60', '61_90', 'MAS_90'] as const;
export type Tramo = (typeof TRAMOS)[number];
export type EstadoObligacion = 'PENDIENTE' | 'PARCIAL' | 'PAGADA';

const diaUtc = (f: string) =>
  Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));

/** Días de mora a la fecha de corte (AAAA-MM-DD). El día del vencimiento aún no hay mora. */
export const diasDeMora = (vencimiento: string, corte: string) =>
  Math.max(0, Math.round((diaUtc(corte) - diaUtc(vencimiento)) / 86_400_000));

export function tramoDe(dias: number): Tramo {
  if (dias <= 0) return 'CORRIENTE';
  if (dias <= 30) return '01_30';
  if (dias <= 60) return '31_60';
  if (dias <= 90) return '61_90';
  return 'MAS_90';
}

export interface MovimientoBasico {
  tipo: TipoMovimientoCartera;
  valor: Prisma.Decimal;
}

export interface SaldoObligacion {
  /** Cargo inicial más ajustes débito. */
  cargos: Prisma.Decimal;
  /** Pagos verificados menos sus reversos. */
  pagos: Prisma.Decimal;
  /** Ajustes crédito y créditos aplicados. */
  creditos: Prisma.Decimal;
  saldo: Prisma.Decimal;
  estado: EstadoObligacion;
  vencida: boolean;
  diasMora: number;
  tramo: Tramo;
}

/**
 * RN-02: saldo = obligación + ajustes débito − pagos verificados (netos de reversos) − créditos.
 * La mora solo cuenta mientras haya saldo.
 */
export function calcularSaldo(
  movimientos: readonly MovimientoBasico[],
  vencimiento: string,
  corte: string,
): SaldoObligacion {
  const cero = new Prisma.Decimal(0);
  let cargos = cero;
  let pagos = cero;
  let creditos = cero;
  for (const m of movimientos) {
    if (m.tipo === 'CARGO' || m.tipo === 'AJUSTE_DEBITO') cargos = cargos.plus(m.valor);
    else if (m.tipo === 'PAGO') pagos = pagos.plus(m.valor);
    else if (m.tipo === 'REVERSO_PAGO') pagos = pagos.minus(m.valor);
    else creditos = creditos.plus(m.valor);
  }
  const saldo = cargos.minus(pagos).minus(creditos);
  const conSaldo = saldo.gt(0);
  const diasMora = conSaldo ? diasDeMora(vencimiento, corte) : 0;
  return {
    cargos,
    pagos,
    creditos,
    saldo,
    estado: !conSaldo ? 'PAGADA' : pagos.gt(0) || creditos.gt(0) ? 'PARCIAL' : 'PENDIENTE',
    vencida: conSaldo && diasMora > 0,
    diasMora,
    tramo: tramoDe(diasMora),
  };
}

export const numeroObligacion = (numero: number) => `OBL-${String(numero).padStart(5, '0')}`;
