import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { calcularSaldo } from './cartera.reglas';

const dec = (n: number) => new Prisma.Decimal(n);
const hoy = new Date('2026-11-16T12:00:00Z');
const ob = (
  dias: number,
  movimientos: { tipo: 'CARGO' | 'PAGO' | 'AJUSTE_CREDITO'; valor: number }[] = [],
) => ({
  valor: dec(500),
  fechaVencimiento: new Date(hoy.getTime() - dias * 86400000),
  movimientos: movimientos.map((m) => ({ tipo: m.tipo, valor: dec(m.valor) })),
});
describe('calcularSaldo', () => {
  it('suma cargos y descuenta solo movimientos de pago', () => {
    expect(
      calcularSaldo(
        ob(2, [
          { tipo: 'CARGO', valor: 500 },
          { tipo: 'PAGO', valor: 200 },
        ]),
        hoy,
      ),
    ).toMatchObject({ saldo: dec(300), estado: 'PARCIAL', dias: 2, tramo: '01_30' });
  });
  it('clasifica los rangos exactos de mora', () => {
    expect(calcularSaldo(ob(31, [{ tipo: 'CARGO', valor: 500 }]), hoy).tramo).toBe('31_60');
    expect(calcularSaldo(ob(61, [{ tipo: 'CARGO', valor: 500 }]), hoy).tramo).toBe('61_90');
    expect(calcularSaldo(ob(91, [{ tipo: 'CARGO', valor: 500 }]), hoy).tramo).toBe('MAS_90');
  });
  it('marca saldo cero pagado y evita saldos negativos', () => {
    expect(
      calcularSaldo(
        ob(4, [
          { tipo: 'CARGO', valor: 500 },
          { tipo: 'PAGO', valor: 500 },
        ]),
        hoy,
      ).estado,
    ).toBe('PAGADA');
    expect(
      calcularSaldo(
        ob(4, [
          { tipo: 'CARGO', valor: 500 },
          { tipo: 'PAGO', valor: 600 },
        ]),
        hoy,
      ).saldo,
    ).toEqual(dec(0));
  });
  it('marca deuda vigente como pendiente', () => {
    expect(calcularSaldo(ob(-1, [{ tipo: 'CARGO', valor: 500 }]), hoy)).toMatchObject({
      estado: 'PENDIENTE',
      tramo: 'CORRIENTE',
    });
  });
});
