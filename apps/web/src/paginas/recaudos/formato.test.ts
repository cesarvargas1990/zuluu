import { describe, expect, it } from 'vitest';
import type { RecaudoListado } from '@/api/recaudos';
import { centavosDe, csvDeRecaudos, decimalDe, fecha } from './formato';

describe('centavosDe', () => {
  it.each([
    ['580.000', 58000000],
    ['$ 580.000', 58000000],
    ['580000', 58000000],
    ['1.250.000,50', 125000050],
    ['580000,5', 58000050],
    ['0,10', 10],
  ])('interpreta %s en formato colombiano', (texto, esperado) => {
    expect(centavosDe(texto)).toBe(esperado);
  });

  it.each(['', '0', 'abc', '12.34.56', '-5', '1,234'])('rechaza %s', (texto) => {
    expect(centavosDe(texto)).toBeNull();
  });

  it('decimalDe produce el texto que acepta el API', () => {
    expect(decimalDe(58000000)).toBe('580000');
    expect(decimalDe(58000050)).toBe('580000.50');
  });
});

describe('fecha', () => {
  it('no se corre de día por la zona horaria', () => {
    expect(fecha('2026-11-10')).toBe('10/11/2026');
    expect(fecha(null)).toBe('—');
  });
});

describe('csvDeRecaudos', () => {
  it('neutraliza fórmulas y escapa comillas', () => {
    const csv = csvDeRecaudos([
      {
        numeroVisible: 'RC-0001',
        fechaPago: '2026-11-10',
        unidad: null,
        propietario: null,
        pagador: '=HYPERLINK("http://x")',
        medio: 'EFECTIVO',
        referencia: 'A"B',
        banco: null,
        valor: '580000.5',
        saldoAFavor: '0',
        estado: 'PENDIENTE',
      } as RecaudoListado,
    ]);
    const fila = csv.split('\r\n')[1]!;
    expect(fila).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(fila).toContain('"A""B"');
    expect(fila).toContain('"580000,5"');
    expect(fila).toContain('"Sin identificar"');
  });
});
