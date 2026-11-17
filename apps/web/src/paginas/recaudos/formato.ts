import type { ConceptoImputacion, EstadoRecaudo, MedioPago, RecaudoListado } from '@/api/recaudos';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
export const dinero = (valor: string | number | null | undefined) =>
  valor == null || valor === '' ? '—' : COP.format(Number(valor));

/** Fecha AAAA-MM-DD → DD/MM/AAAA, sin pasar por zonas horarias. */
export const fecha = (valor: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
export const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

/** Hoy en Colombia como AAAA-MM-DD. */
export const hoy = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/**
 * Interpreta lo que escribe la persona en formato colombiano: el punto separa miles y la coma
 * decimales ("580.000" son quinientos ochenta mil). Devuelve el valor en centavos o null.
 * Misma regla que usa el servidor.
 */
export function centavosDe(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, '');
  let normalizado: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpio))
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(limpio)) normalizado = limpio.replace(',', '.');
  else if (/^\d+(\.\d{1,2})?$/.test(limpio)) normalizado = limpio;
  else return null;
  const centavos = Math.round(Number(normalizado) * 100);
  return centavos > 0 && Number.isSafeInteger(centavos) ? centavos : null;
}
/** Centavos → texto decimal que acepta el API ("580000" o "580000.50"). */
export const decimalDe = (centavos: number) =>
  centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2);

export const MEDIOS: readonly [MedioPago, string][] = [
  ['TRANSFERENCIA', 'Transferencia'],
  ['CONSIGNACION', 'Consignación'],
  ['EFECTIVO', 'Efectivo'],
  ['OTRO', 'Otro'],
];
export const nombreMedio = (m: MedioPago) => MEDIOS.find(([c]) => c === m)?.[1] ?? m;

export const ESTADOS: readonly [EstadoRecaudo, string][] = [
  ['PENDIENTE', 'Pendiente de verificar'],
  ['VERIFICADO', 'Verificado'],
  ['OBSERVADO', 'Observado'],
  ['ANULADO', 'Anulado'],
];
export const nombreEstado = (e: EstadoRecaudo) => ESTADOS.find(([c]) => c === e)?.[1] ?? e;
export const tonoEstado = (e: EstadoRecaudo) =>
  (({ PENDIENTE: 'aviso', VERIFICADO: 'ok', OBSERVADO: 'error', ANULADO: 'info' }) as const)[e];

export const CONCEPTOS: readonly [ConceptoImputacion, string][] = [
  ['CUOTA_ADMINISTRACION', 'Cuota de administración'],
  ['CUOTA_VENCIDA', 'Cuota vencida'],
  ['INTERESES', 'Intereses de mora'],
  ['CUOTA_EXTRAORDINARIA', 'Cuota extraordinaria'],
  ['OTRO', 'Otro concepto'],
  ['SALDO_INICIAL', 'Saldo inicial'],
];
export const nombreConcepto = (c: ConceptoImputacion) => CONCEPTOS.find(([k]) => k === c)?.[1] ?? c;

/** Periodo AAAA-MM → "nov 2026". */
export const nombrePeriodo = (p: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('es-CO', {
    month: 'short',
    year: 'numeric',
  });
};

const ACCIONES: Record<string, string> = {
  'recaudo.registrado': 'Registro del pago',
  'recaudo.modificado': 'Modificación de datos',
  'recaudo.identificado': 'Unidad asignada',
  'recaudo.soporte_cargado': 'Comprobante cargado',
  'recaudo.soporte_consultado': 'Comprobante descargado',
  'recaudo.verificado': 'Verificación',
  'recaudo.observado': 'Observación',
  'recaudo.anulado': 'Anulación',
};
export const nombreAccion = (a: string) => ACCIONES[a] ?? a;

export function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

export const bytesDeBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/** Evita que Excel ejecute como fórmula un texto que empiece por = + - @. */
const celdaCsv = (valor: string | number | null | undefined) => {
  const texto = String(valor ?? '');
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
};

export function csvDeRecaudos(items: RecaudoListado[]) {
  const filas = [
    [
      'Registro',
      'Fecha de pago',
      'Unidad',
      'Propietario',
      'Pagador',
      'Medio',
      'Referencia',
      'Banco',
      'Valor',
      'Saldo a favor',
      'Estado',
    ],
    ...items.map((r) => [
      r.numeroVisible,
      fecha(r.fechaPago),
      r.unidad?.codigo ?? 'Sin identificar',
      r.propietario?.nombre ?? '',
      r.pagador ?? '',
      nombreMedio(r.medio),
      r.referencia ?? '',
      r.banco ?? '',
      // Sin separador de miles y con coma decimal: Excel en español lo lee como número.
      r.valor.replace('.', ','),
      r.saldoAFavor.replace('.', ','),
      nombreEstado(r.estado),
    ]),
  ];
  // Marca BOM para que Excel reconozca UTF-8; punto y coma como separador regional.
  return `${String.fromCharCode(0xfeff)}${filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n')}`;
}
