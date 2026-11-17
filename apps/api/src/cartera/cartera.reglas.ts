import { Prisma, type TipoMovimientoCartera } from '@prisma/client';

export function calcularSaldo(
  o: {
    valor: Prisma.Decimal;
    fechaVencimiento: Date;
    movimientos: { tipo: TipoMovimientoCartera; valor: Prisma.Decimal }[];
  },
  hoy = new Date(),
) {
  let saldo = new Prisma.Decimal(0);
  for (const m of o.movimientos) {
    saldo = saldo.add(
      ['PAGO', 'AJUSTE_CREDITO', 'CREDITO_APLICADO'].includes(m.tipo) ? m.valor.negated() : m.valor,
    );
  }
  if (saldo.lt(0)) saldo = new Prisma.Decimal(0);
  const dias = Math.max(
    0,
    Math.floor(
      (Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) -
        Date.UTC(
          o.fechaVencimiento.getUTCFullYear(),
          o.fechaVencimiento.getUTCMonth(),
          o.fechaVencimiento.getUTCDate(),
        )) /
        86400000,
    ),
  );
  const estado = saldo.isZero()
    ? 'PAGADA'
    : saldo.lt(o.valor)
      ? 'PARCIAL'
      : dias > 0
        ? 'VENCIDA'
        : 'PENDIENTE';
  const tramo =
    dias === 0
      ? 'CORRIENTE'
      : dias <= 30
        ? '01_30'
        : dias <= 60
          ? '31_60'
          : dias <= 90
            ? '61_90'
            : 'MAS_90';
  return { saldo, estado, dias, tramo };
}
