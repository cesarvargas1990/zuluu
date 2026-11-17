import { describe, expect, it } from 'vitest';
import {
  ErrorRegla,
  calcularImputacion,
  numeroVisible,
  parsearFecha,
  parsearMedio,
  parsearValor,
  tipoArchivoReal,
} from './recaudos.reglas';

describe('parsearValor', () => {
  it.each([
    [580000, '580000'],
    ['580000', '580000'],
    ['580.000', '580000'],
    ['$ 580.000', '580000'],
    ['1.250.000,50', '1250000.5'],
    ['580000,5', '580000.5'],
    ['580000.75', '580000.75'],
  ])('acepta %s', (entrada, esperado) => {
    expect(parsearValor(entrada)?.toString()).toBe(esperado);
  });

  it.each([
    0,
    -5,
    '',
    'abc',
    '12.34.56',
    '1,2,3',
    null,
    undefined,
    '580000.123',
    100.123,
    Number.NaN,
    Infinity,
  ])('rechaza %s', (entrada) => {
    expect(parsearValor(entrada)).toBeNull();
  });
});

describe('parsearFecha', () => {
  it.each([
    ['2026-11-10', '2026-11-10'],
    ['10/11/2026', '2026-11-10'],
    ['1/2/2026', '2026-02-01'],
    ['10-11-2026', '2026-11-10'],
  ])('acepta %s', (entrada, esperado) => {
    expect(parsearFecha(entrada)).toBe(esperado);
  });

  it('acepta una fecha de Excel leída como Date', () => {
    expect(parsearFecha(new Date(2026, 10, 10))).toBe('2026-11-10');
  });

  it.each(['', '31/02/2026', '2026-13-01', 'ayer', null, 45000])('rechaza %s', (entrada) => {
    expect(parsearFecha(entrada)).toBeNull();
  });
});

describe('parsearMedio', () => {
  it('reconoce los medios sin importar tildes ni mayúsculas', () => {
    expect(parsearMedio('Consignación')).toBe('CONSIGNACION');
    expect(parsearMedio(' transferencia ')).toBe('TRANSFERENCIA');
    expect(parsearMedio('EFECTIVO')).toBe('EFECTIVO');
    expect(parsearMedio('otro')).toBe('OTRO');
    expect(parsearMedio('cheque')).toBeNull();
  });
});

describe('calcularImputacion', () => {
  it('abono parcial: deja saldo pendiente y no hay saldo a favor (CA-04)', () => {
    const r = calcularImputacion('300000', [
      {
        concepto: 'CUOTA_ADMINISTRACION',
        periodo: '2026-11',
        valorObligacion: '580000',
        valorAplicado: '300000',
      },
    ]);
    expect(r.totalAplicado.toString()).toBe('300000');
    expect(r.saldoAFavor.toString()).toBe('0');
    expect(r.lineas[0]!.saldoPendiente?.toString()).toBe('280000');
  });

  it('excedente: queda como saldo a favor (CA-05)', () => {
    const r = calcularImputacion('700000', [
      {
        concepto: 'CUOTA_ADMINISTRACION',
        periodo: '2026-11',
        valorObligacion: '580000',
        valorAplicado: '580000',
      },
    ]);
    expect(r.saldoAFavor.toString()).toBe('120000');
    expect(r.lineas[0]!.saldoPendiente?.toString()).toBe('0');
  });

  it('sin imputaciones todo el pago es anticipo', () => {
    expect(calcularImputacion('400000', []).saldoAFavor.toString()).toBe('400000');
  });

  it('varias obligaciones en un mismo pago', () => {
    const r = calcularImputacion('1160000', [
      { concepto: 'CUOTA_VENCIDA', periodo: '2026-10', valorAplicado: '580000' },
      { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: '580000' },
    ]);
    expect(r.saldoAFavor.toString()).toBe('0');
    expect(r.lineas[0]!.saldoPendiente).toBeNull();
  });

  it('rechaza aplicar más que el valor del pago (RN-05)', () => {
    expect(() =>
      calcularImputacion('500000', [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: '500000.01' },
      ]),
    ).toThrow(ErrorRegla);
  });

  it('rechaza aplicar más que la obligación', () => {
    expect(() =>
      calcularImputacion('700000', [
        {
          concepto: 'CUOTA_ADMINISTRACION',
          periodo: '2026-11',
          valorObligacion: '580000',
          valorAplicado: '600000',
        },
      ]),
    ).toThrow(/obligación/);
  });

  it('rechaza el mismo concepto y periodo repetidos', () => {
    expect(() =>
      calcularImputacion('700000', [
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: '100000' },
        { concepto: 'CUOTA_ADMINISTRACION', periodo: '2026-11', valorAplicado: '100000' },
      ]),
    ).toThrow(/repetid/);
  });

  it('no pierde centavos con decimales', () => {
    const r = calcularImputacion('0.30', [
      { concepto: 'OTRO', periodo: '2026-11', valorAplicado: '0.10' },
      { concepto: 'INTERESES', periodo: '2026-11', valorAplicado: '0.20' },
    ]);
    expect(r.saldoAFavor.toString()).toBe('0');
  });
});

describe('numeroVisible', () => {
  it('formatea el consecutivo', () => {
    expect(numeroVisible(1)).toBe('RC-0001');
    expect(numeroVisible(12345)).toBe('RC-12345');
  });
});

describe('tipoArchivoReal', () => {
  it('detecta PDF, PNG y JPG por su firma', () => {
    expect(tipoArchivoReal(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(tipoArchivoReal(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(tipoArchivoReal(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
  });

  it('rechaza otros contenidos aunque digan ser PDF', () => {
    expect(tipoArchivoReal(Buffer.from('MZ ejecutable'))).toBeNull();
    expect(tipoArchivoReal(Buffer.alloc(0))).toBeNull();
  });
});
