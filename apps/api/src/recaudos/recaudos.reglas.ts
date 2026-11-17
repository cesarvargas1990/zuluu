import { Prisma, type ConceptoImputacion, type MedioPago } from '@prisma/client';

/** Regla de negocio incumplida; el mensaje está listo para mostrarse. */
export class ErrorRegla extends Error {}

const VALOR_MAXIMO = new Prisma.Decimal('9999999999999999.99');

/**
 * Convierte un valor en pesos a Decimal. Acepta números y texto en formato colombiano
 * ("580.000", "$ 1.250.000,50"). Devuelve null si no es mayor que cero o tiene más de dos decimales.
 */
export function parsearValor(entrada: unknown): Prisma.Decimal | null {
  let texto: string;
  if (typeof entrada === 'number') {
    // Un número nunca lleva separador de miles: 100.123 son tres decimales, no cien mil.
    texto = String(entrada);
    if (!/^\d+(\.\d{1,2})?$/.test(texto)) return null;
    const directo = new Prisma.Decimal(texto);
    return directo.gt(0) && directo.lte(VALOR_MAXIMO) ? directo : null;
  } else if (typeof entrada === 'string') {
    texto = entrada.replace(/[$\s]|COP/gi, '');
  } else {
    return null;
  }
  let normalizado: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(texto)) {
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(texto)) {
    normalizado = texto.replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(texto)) {
    normalizado = texto;
  } else {
    return null;
  }
  const valor = new Prisma.Decimal(normalizado);
  return valor.gt(0) && valor.lte(VALOR_MAXIMO) ? valor : null;
}

const dos = (n: number) => String(n).padStart(2, '0');

function fechaValida(anio: number, mes: number, dia: number): string | null {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  const real = f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
  return real && anio >= 2000 && anio <= 2100 ? `${anio}-${dos(mes)}-${dos(dia)}` : null;
}

/** Devuelve la fecha como AAAA-MM-DD. Acepta AAAA-MM-DD, DD/MM/AAAA y fechas de Excel (Date). */
export function parsearFecha(entrada: unknown): string | null {
  if (entrada instanceof Date) {
    if (Number.isNaN(entrada.getTime())) return null;
    // Excel entrega la medianoche local con desfases de segundos: se toma el mediodía.
    const f = new Date(entrada.getTime() + 12 * 3_600_000);
    return fechaValida(f.getFullYear(), f.getMonth() + 1, f.getDate());
  }
  if (typeof entrada !== 'string') return null;
  const texto = entrada.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (local) return fechaValida(Number(local[3]), Number(local[2]), Number(local[1]));
  return null;
}

/** Fecha de hoy en Colombia (AAAA-MM-DD). */
export const hoyEnBogota = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);

const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

export const MEDIOS: readonly MedioPago[] = ['TRANSFERENCIA', 'CONSIGNACION', 'EFECTIVO', 'OTRO'];

export function parsearMedio(entrada: unknown): MedioPago | null {
  if (typeof entrada !== 'string') return null;
  const texto = sinTildes(entrada);
  return MEDIOS.find((m) => m === texto) ?? null;
}

export interface LineaImputacion {
  concepto: ConceptoImputacion;
  /** AAAA-MM */
  periodo: string;
  valorObligacion?: string | number | null;
  valorAplicado: string | number;
}

export interface ResultadoImputacion {
  totalAplicado: Prisma.Decimal;
  saldoAFavor: Prisma.Decimal;
  lineas: {
    concepto: ConceptoImputacion;
    periodo: string;
    valorObligacion: Prisma.Decimal | null;
    valorAplicado: Prisma.Decimal;
    saldoPendiente: Prisma.Decimal | null;
  }[];
}

/**
 * Distribuye un pago entre obligaciones (RN-05, RN-06). Lo no aplicado queda como saldo a favor.
 * Lanza ErrorRegla si se aplica más que el pago o más que una obligación.
 */
export function calcularImputacion(
  valorPago: Prisma.Decimal | string,
  imputaciones: readonly LineaImputacion[],
): ResultadoImputacion {
  const valor = new Prisma.Decimal(valorPago);
  const vistos = new Set<string>();
  let totalAplicado = new Prisma.Decimal(0);
  const lineas = imputaciones.map((i) => {
    const clave = `${i.concepto}|${i.periodo}`;
    if (vistos.has(clave)) {
      throw new ErrorRegla('Hay un concepto y periodo repetidos en la distribución.');
    }
    vistos.add(clave);
    const valorAplicado = parsearValor(i.valorAplicado);
    if (!valorAplicado) throw new ErrorRegla('Cada valor aplicado debe ser mayor que cero.');
    const valorObligacion = i.valorObligacion == null ? null : parsearValor(i.valorObligacion);
    if (i.valorObligacion != null && !valorObligacion) {
      throw new ErrorRegla('El valor de la obligación debe ser mayor que cero.');
    }
    if (valorObligacion && valorAplicado.gt(valorObligacion)) {
      throw new ErrorRegla('El valor aplicado no puede superar el valor de la obligación.');
    }
    totalAplicado = totalAplicado.plus(valorAplicado);
    return {
      concepto: i.concepto,
      periodo: i.periodo,
      valorObligacion,
      valorAplicado,
      saldoPendiente: valorObligacion ? valorObligacion.minus(valorAplicado) : null,
    };
  });
  if (totalAplicado.gt(valor)) {
    throw new ErrorRegla('La suma aplicada no puede superar el valor del pago.');
  }
  return { totalAplicado, saldoAFavor: valor.minus(totalAplicado), lineas };
}

export const numeroVisible = (numero: number) => `RC-${String(numero).padStart(4, '0')}`;

export const TIPOS_SOPORTE = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Tipo real del archivo según su firma; null si no es PDF, JPG ni PNG. */
export function tipoArchivoReal(contenido: Buffer): (typeof TIPOS_SOPORTE)[number] | null {
  if (contenido.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (
    contenido.length >= 3 &&
    contenido[0] === 0xff &&
    contenido[1] === 0xd8 &&
    contenido[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    contenido.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}
