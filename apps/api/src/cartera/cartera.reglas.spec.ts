import { Prisma, type TipoMovimientoCartera } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calcularSaldo, diasDeMora, numeroObligacion, tramoDe } from './cartera.reglas';

const m = (tipo: TipoMovimientoCartera, valor: number) => ({
  tipo,
  valor: new Prisma.Decimal(valor),
});

describe('diasDeMora y tramoDe', () => {
  it('el día del vencimiento y antes no hay mora', () => {
    expect(diasDeMora('2026-11-10', '2026-11-10')).toBe(0);
    expect(diasDeMora('2026-11-10', '2026-11-01')).toBe(0);
    expect(diasDeMora('2026-11-10', '2026-11-11')).toBe(1);
  });

  it.each([
    [0, 'CORRIENTE'],
    [1, '01_30'],
    [30, '01_30'],
    [31, '31_60'],
    [60, '31_60'],
    [61, '61_90'],
    [90, '61_90'],
    [91, 'MAS_90'],
  ])('%i días → %s (CA-05)', (dias, tramo) => {
    expect(tramoDe(dias)).toBe(tramo);
  });

  it('cuenta días reales entre meses', () => {
    expect(diasDeMora('2026-09-10', '2026-11-16')).toBe(67);
  });
});

describe('calcularSaldo', () => {
  it('sin pagos: pendiente por el total', () => {
    const r = calcularSaldo([m('CARGO', 550000)], '2026-11-10', '2026-11-05');
    expect(r).toMatchObject({ estado: 'PENDIENTE', vencida: false, tramo: 'CORRIENTE' });
    expect(r.saldo.toString()).toBe('550000');
  });

  it('abono parcial: sigue abierta por el remanente y puede estar vencida (CA-06)', () => {
    const r = calcularSaldo([m('CARGO', 550000), m('PAGO', 400000)], '2026-10-10', '2026-11-16');
    expect(r.saldo.toString()).toBe('150000');
    expect(r).toMatchObject({ estado: 'PARCIAL', vencida: true, diasMora: 37, tramo: '31_60' });
  });

  it('el reverso de un pago restituye el saldo (CA-04)', () => {
    const r = calcularSaldo(
      [m('CARGO', 550000), m('PAGO', 400000), m('REVERSO_PAGO', 400000)],
      '2026-10-10',
      '2026-10-01',
    );
    expect(r.saldo.toString()).toBe('550000');
    expect(r.estado).toBe('PENDIENTE');
    expect(r.pagos.toString()).toBe('0');
  });

  it('ajustes aprobados: el débito suma y el crédito resta (RN-02)', () => {
    const r = calcularSaldo(
      [m('CARGO', 500000), m('AJUSTE_DEBITO', 20000), m('AJUSTE_CREDITO', 70000)],
      '2026-11-10',
      '2026-11-01',
    );
    expect(r.saldo.toString()).toBe('450000');
    expect(r.cargos.toString()).toBe('520000');
    expect(r.estado).toBe('PARCIAL');
  });

  it('pagada: sin saldo no hay mora aunque el vencimiento haya pasado', () => {
    const r = calcularSaldo([m('CARGO', 500000), m('PAGO', 500000)], '2026-01-10', '2026-11-16');
    expect(r).toMatchObject({ estado: 'PAGADA', vencida: false, diasMora: 0, tramo: 'CORRIENTE' });
  });

  it('no pierde centavos', () => {
    const r = calcularSaldo(
      [m('CARGO', 0.3), m('PAGO', 0.1), m('PAGO', 0.2)],
      '2026-11-10',
      '2026-11-16',
    );
    expect(r.saldo.toString()).toBe('0');
    expect(r.estado).toBe('PAGADA');
  });
});

describe('numeroObligacion', () => {
  it('formatea el consecutivo', () => {
    expect(numeroObligacion(31)).toBe('OBL-00031');
  });
});
